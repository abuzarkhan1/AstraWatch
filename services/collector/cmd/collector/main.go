package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"github.com/astrawatch/collector/internal/consumer"
	"github.com/astrawatch/collector/internal/enrich"
	"github.com/astrawatch/collector/internal/ingest"
	"github.com/astrawatch/collector/internal/produce"
	"github.com/astrawatch/collector/internal/query"
	"github.com/astrawatch/collector/internal/ratelimit"
	"github.com/astrawatch/collector/internal/validate"
	"github.com/astrawatch/collector/pkg"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
	"go.opentelemetry.io/otel"
	"go.uber.org/zap"
)

func main() {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	cfg := loadConfig()
	if cfg.JWTSecret == "" {
		logger.Fatal("JWT_SECRET environment variable is required — refusing to start with empty secret")
	}

	rdb := redis.NewClient(&redis.Options{
		Addr: cfg.RedisAddr,
		DB:   0,
	})

	clickConn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{cfg.ClickHouseAddr},
		Auth: clickhouse.Auth{
			Database: cfg.ClickHouseDB,
			Username: cfg.ClickHouseUser,
			Password: cfg.ClickHousePassword,
		},
		Settings: clickhouse.Settings{
			"max_execution_time": 60,
		},
		DialTimeout: 5 * time.Second,
	})
	if err != nil {
		logger.Fatal("failed to connect to ClickHouse", zap.Error(err))
	}

	producer, err := produce.NewProducer(cfg.KafkaBrokers, rdb, logger)
	if err != nil {
		logger.Fatal("failed to create producer", zap.Error(err))
	}
	defer producer.Close()

	kafkaConsumer, err := consumer.NewConsumer(cfg.KafkaBrokers, clickConn, logger)
	if err != nil {
		logger.Fatal("failed to create consumer", zap.Error(err))
	}
	go kafkaConsumer.Start(context.Background())

	// Kafka backlog observability (audit Phase 7): GetKafkaLag() existed but was
	// never wired to /metrics — consumer lag monitoring was dead code. Refresh a
	// gauge every 30s so unbounded topic growth is visible/alertable.
	kafkaLagGauge := promauto.NewGauge(prometheus.GaugeOpts{
		Name: "astrawatch_kafka_raw_metrics_backlog_total",
		Help: "Total messages currently in the raw-metrics Kafka topic (end offsets across partitions).",
	})
	// Cancellable so the probe loop stops on graceful shutdown (review fix: the
	// old select on context.Background().Done() could never fire).
	probeCtx, stopProbe := context.WithCancel(context.Background())
	defer stopProbe()
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			if lag, err := producer.GetKafkaLag(); err == nil {
				kafkaLagGauge.Set(float64(lag))
			} else {
				logger.Warn("kafka lag probe failed", zap.Error(err))
			}
			select {
			case <-ticker.C:
			case <-probeCtx.Done():
				return
			}
		}
	}()

	enricher := enrich.NewEnricher()
	validator := validate.NewValidator()

	// Distributed rate limiting (audit P4.14): when Redis is reachable, limits
	// are enforced with a shared fixed-window counter so every collector replica
	// agrees on throughput; on Redis failure it degrades to an in-memory token
	// bucket rather than failing open. (The RPS here is per-tenant: 1000 req/s
	// burst 2000; the Redis path enforces 1000 requests per 1s window.)
	limiter := ratelimit.NewRedisRateLimiter(rdb, 1000, time.Second, 1000, 2000)

	handler := ingest.NewHandler(producer, enricher, validator, limiter, logger)
	handler.StartWorkerPool(10)

	queryService := query.NewQueryService(clickConn)

	// Usage metering (audit P4.15): per-tenant counters for metrics/logs/traces
	// ingested today, surfaced at /v1/usage/current for the billing UI. Best
	// effort — Redis unavailable means metering is simply skipped.
	meter := &usageMeter{rdb: rdb}
	handler.SetMeter(meter)

	// OpenTelemetry tracer initialization
	_ = otel.Tracer("collector")

	router := gin.Default()

	router.Use(otelgin.Middleware("collector"))
	router.Use(traceMiddleware())
	router.Use(corsMiddleware())
	router.Use(authMiddleware(cfg.JWTSecret))

	agentHandler := ingest.NewAgentHandler(producer, enricher, validator, limiter)

	grpcPort := getEnv("GRPC_PORT", "9090")
	grpcCert := getEnv("GRPC_TLS_CERT", "")
	grpcKey := getEnv("GRPC_TLS_KEY", "")
	grpcServer, err := ingest.StartGRPCCollector(agentHandler, grpcPort, grpcCert, grpcKey)
	if err != nil {
		logger.Warn("gRPC collector not started", zap.Error(err))
	} else {
		logger.Info("gRPC collector started", zap.String("port", grpcPort))
	}
	defer func() {
		if grpcServer != nil {
			grpcServer.Stop()
		}
	}()

	v1 := router.Group("/v1")
	{
		ingestGroup := v1.Group("/ingest")
		{
			ingestGroup.POST("/metrics/batch", handler.IngestMetricsBatch)
			ingestGroup.POST("/logs/stream", handler.IngestLogsStream)
			ingestGroup.POST("/traces", handler.IngestTraces)
		}

		// First-class OpenTelemetry ingestion (strategy gap 2): standard OTLP/HTTP
		// JSON endpoints so the OTel Collector can ship logs/metrics/traces here
		// directly — no custom agent required. The OTel Collector cannot carry a
		// user JWT, so this group is guarded by the shared internal token (same
		// pattern as /api/v1/metrics) instead of the auth middleware above; the
		// tenant is taken from an X-Tenant-Id header set in the collector config.
		otelGroup := v1.Group("/otel")
		otelGroup.Use(internalTokenMiddleware())
		{
			otelGroup.POST("/v1/logs", handler.IngestOTLPLogs)
			otelGroup.POST("/v1/metrics", handler.IngestOTLPMetrics)
			otelGroup.POST("/v1/traces", handler.IngestTraces)
		}

		agentGroup := v1.Group("/agent")
		{
			agentGroup.POST("/metrics", agentHandler.HandleAgentBatch)
			agentGroup.GET("/health", agentHandler.HandleAgentHealth)
		}

		v1.POST("/telemetry", handler.IngestMetricsBatch)

		v1.GET("/query", func(c *gin.Context) {
			// Unified query dispatch (audit F7): the frontend Logs/Trace Explorers
			// call /v1/query with type=logs | type=traces; metrics stay default.
			queryType := c.Query("type")
			if queryType == "logs" {
				handleLogQuery(c, queryService)
				return
			}
			if queryType == "traces" {
				handleTraceQuery(c, queryService)
				return
			}

			tenantID := tenantFromClaims(c)
			serviceID := c.Query("service")
			metric := c.Query("metric")
			step := c.Query("step")
			from, _ := time.Parse(time.RFC3339, c.Query("from"))
			to, _ := time.Parse(time.RFC3339, c.Query("to"))

			if serviceID == "" || metric == "" {
				writeEnvelopeOuter(c, http.StatusBadRequest, nil, gin.H{"error": "service and metric are required"})
				return
			}

			var result *pkg.QueryResult
			var err error
			if step != "" {
				dur, parseErr := time.ParseDuration(step)
				if parseErr != nil {
					writeEnvelopeOuter(c, http.StatusBadRequest, nil, gin.H{"error": "invalid step duration: " + parseErr.Error()})
					return
				}
				result, err = queryService.QueryMetricsWithStepTenant(c.Request.Context(), tenantID, serviceID, metric, from, to, dur)
			} else {
				result, err = queryService.QueryMetricsTenant(c.Request.Context(), tenantID, serviceID, metric, from, to)
			}
			if err != nil {
				writeEnvelopeOuter(c, http.StatusInternalServerError, nil, gin.H{"error": err.Error()})
				return
			}

			writeEnvelopeOuter(c, http.StatusOK, result, nil)
		})

		v1.GET("/query/logs", func(c *gin.Context) {
			handleLogQuery(c, queryService)
		})

		v1.GET("/query/traces", func(c *gin.Context) {
			handleTraceQuery(c, queryService)
		})

		// Usage metering (audit P4.15): today's ingested metrics/logs/traces for
		// the authenticated tenant, consumed by the Billing page.
		v1.GET("/usage/current", func(c *gin.Context) {
			tenantID := tenantFromClaims(c)
			if tenantID == "" {
				writeEnvelopeOuter(c, http.StatusUnauthorized, nil, gin.H{"error": "tenant not resolvable from token"})
				return
			}
			writeEnvelopeOuter(c, http.StatusOK, meter.Current(c.Request.Context(), tenantID), nil)
		})

		// Usage history (audit P4.15 follow-up): last N days of ingested volume
		// per tenant, for the Billing page usage-over-time chart.
		v1.GET("/usage/history", func(c *gin.Context) {
			tenantID := tenantFromClaims(c)
			if tenantID == "" {
				writeEnvelopeOuter(c, http.StatusUnauthorized, nil, gin.H{"error": "tenant not resolvable from token"})
				return
			}
			days := 30
			if d := c.Query("days"); d != "" {
				if parsed, err := strconv.Atoi(d); err == nil {
					days = parsed
				}
			}
			writeEnvelopeOuter(c, http.StatusOK, meter.History(c.Request.Context(), tenantID, days), nil)
		})

		v1.GET("/health", handler.HealthCheck)
	}

	internalMetricsGroup := router.Group("/api/v1/metrics")
	internalMetricsGroup.Use(internalTokenMiddleware())
	{
		internalMetricsGroup.GET("/query", func(c *gin.Context) {
			serviceID := c.Query("service")
			metric := c.Query("metric")
			if serviceID == "" || metric == "" {
				writeEnvelopeOuter(c, http.StatusBadRequest, nil, gin.H{"error": "service and metric are required"})
				return
			}
			to := time.Now()
			from := to.Add(-time.Minute)
			// Optional window (minutes) + aggregation so internal consumers (SLO
			// attainment, alert rule evaluation) get a real average over a window
			// instead of a single 1-minute point.
			if w := c.Query("window"); w != "" {
				if mins, err := strconv.Atoi(w); err == nil && mins > 0 {
					from = to.Add(-time.Duration(mins) * time.Minute)
				}
			}
			if agg := c.Query("agg"); agg != "" {
				val, err := queryService.QueryAggregated(c.Request.Context(), serviceID, metric, from, to, agg)
				if err != nil {
					writeEnvelopeOuter(c, http.StatusInternalServerError, nil, gin.H{"error": err.Error()})
					return
				}
				writeEnvelopeOuter(c, http.StatusOK, gin.H{"value": val, "timestamp": to.Format(time.RFC3339)}, nil)
				return
			}
			result, err := queryService.QueryMetrics(c.Request.Context(), serviceID, metric, from, to)
			if err != nil {
				writeEnvelopeOuter(c, http.StatusInternalServerError, nil, gin.H{"error": err.Error()})
				return
			}
			if result == nil || len(result.Series) == 0 {
				writeEnvelopeOuter(c, http.StatusOK, gin.H{"value": 0, "timestamp": to.Format(time.RFC3339)}, nil)
				return
			}
			last := result.Series[len(result.Series)-1]
			writeEnvelopeOuter(c, http.StatusOK, gin.H{
				"value":     last.Value,
				"timestamp": last.Timestamp.Format(time.RFC3339),
			}, nil)
		})
	}

	catalogGroup := router.Group("/api/v1/catalog")
	{
		// Catalog endpoints are backed by real ingested telemetry (audit V2: they
		// were hardcoded stubs returning fake services). listServices now reflects
		// the distinct services the collector actually sees, tenant-scoped.
		catalogGroup.GET("/services", func(c *gin.Context) { listServices(c, queryService) })
		catalogGroup.GET("/services/:id", func(c *gin.Context) { getServiceDetail(c, queryService) })
		catalogGroup.POST("/services", createService)
		catalogGroup.GET("/services/:id/health", func(c *gin.Context) { getServiceHealth(c, queryService) })
		catalogGroup.PUT("/services/:id", updateService)
		catalogGroup.GET("/services/:id/dependencies", func(c *gin.Context) { getServiceDependencies(c, queryService) })
		catalogGroup.POST("/services/:id/scorecard", submitServiceScorecard)
	}

	router.GET("/metrics", gin.WrapH(promhttp.Handler()))

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		logger.Info("starting collector service", zap.String("port", cfg.Port))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("server failed", zap.Error(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down server")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatal("server forced to shutdown", zap.Error(err))
	}
}

// usageMeter increments per-tenant daily counters in Redis and reads them back
// for /v1/usage/current and /v1/usage/history. All writes are best-effort: a
// Redis outage never fails ingestion.
type usageMeter struct {
	rdb *redis.Client
}

// Keys are per-day so the billing UI can render a usage-over-time series
// (audit P4.15 follow-up). TTL is 30 days to cover a full billing window.
func (m *usageMeter) keyFor(tenantID, date, kind string) string {
	return "usage:" + tenantID + ":" + date + ":" + kind
}

func (m *usageMeter) key(tenantID, kind string) string {
	return m.keyFor(tenantID, time.Now().UTC().Format("20060102"), kind)
}

func (m *usageMeter) Add(ctx context.Context, tenantID, kind string, n int64) {
	if m == nil || m.rdb == nil || n <= 0 {
		return
	}
	cctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	pipe := m.rdb.Pipeline()
	key := m.key(tenantID, kind)
	pipe.IncrBy(cctx, key, n)
	pipe.Expire(cctx, key, 30*24*time.Hour)
	_, _ = pipe.Exec(cctx)
}

func (m *usageMeter) Current(ctx context.Context, tenantID string) gin.H {
	out := gin.H{
		"tenantId": tenantID,
		"date":     time.Now().UTC().Format("2006-01-02"),
		"metrics":  0,
		"logs":     0,
		"traces":   0,
	}
	if m == nil || m.rdb == nil {
		return out
	}
	cctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	pipe := m.rdb.Pipeline()
	metricsCmd := pipe.Get(cctx, m.key(tenantID, "metrics"))
	logsCmd := pipe.Get(cctx, m.key(tenantID, "logs"))
	tracesCmd := pipe.Get(cctx, m.key(tenantID, "traces"))
	_, _ = pipe.Exec(cctx)

	if v, err := metricsCmd.Int64(); err == nil {
		out["metrics"] = v
	}
	if v, err := logsCmd.Int64(); err == nil {
		out["logs"] = v
	}
	if v, err := tracesCmd.Int64(); err == nil {
		out["traces"] = v
	}
	return out
}

// History returns a per-day time series (oldest → newest) of the last `days`
// days for the tenant, reading the per-day Redis counters. Missing days (no
// ingestion) are returned as zero so the chart has a complete axis. Clamped to
// 90 days.
func (m *usageMeter) History(ctx context.Context, tenantID string, days int) gin.H {
	out := gin.H{"tenantId": tenantID, "days": []gin.H{}}
	if m == nil || m.rdb == nil || days <= 0 {
		return out
	}
	if days > 90 {
		days = 90
	}
	cctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	// Read all (date, kind) keys for the window in one pipeline round-trip.
	type keySpec struct {
		date string
		kind string
		cmd  *redis.StringCmd
	}
	now := time.Now().UTC()
	pipe := m.rdb.Pipeline()
	var specs []keySpec
	for i := days - 1; i >= 0; i-- {
		date := now.AddDate(0, 0, -i).Format("20060102")
		for _, kind := range []string{"metrics", "logs", "traces"} {
			specs = append(specs, keySpec{date: date, kind: kind, cmd: pipe.Get(cctx, m.keyFor(tenantID, date, kind))})
		}
	}
	_, _ = pipe.Exec(cctx)

	// Group the reads back into per-day buckets in chronological order.
	byDate := make(map[string]gin.H, days)
	var order []string
	for _, s := range specs {
		bucket, ok := byDate[s.date]
		if !ok {
			bucket = gin.H{"date": s.date, "metrics": 0, "logs": 0, "traces": 0}
			byDate[s.date] = bucket
			order = append(order, s.date)
		}
		if v, err := s.cmd.Int64(); err == nil && v > 0 {
			bucket[s.kind] = v
		}
	}

	daysOut := make([]gin.H, 0, len(order))
	for _, date := range order {
		daysOut = append(daysOut, byDate[date])
	}
	out["days"] = daysOut
	return out
}

type Config struct {
	Port              string
	KafkaBrokers      []string
	ClickHouseAddr    string
	ClickHouseDB      string
	ClickHouseUser    string
	ClickHousePassword string
	RedisAddr         string
	JWTSecret         string
}

func loadConfig() Config {
	return Config{
		Port:               getEnv("PORT", "8080"),
		KafkaBrokers:       getEnvAsSlice("KAFKA_BROKERS", []string{"localhost:9092"}),
		ClickHouseAddr:     getEnv("CLICKHOUSE_ADDR", "localhost:9000"),
		ClickHouseDB:       getEnv("CLICKHOUSE_DB", "astrawatch"),
		ClickHouseUser:     getEnv("CLICKHOUSE_USER", "astrawatch"),
		ClickHousePassword: getEnv("CLICKHOUSE_PASSWORD", "astrawatch"),
		RedisAddr:          getEnv("REDIS_ADDR", "localhost:6379"),
		JWTSecret:          os.Getenv("JWT_SECRET"),
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func getEnvAsSlice(key string, fallback []string) []string {
	if value, ok := os.LookupEnv(key); ok {
		parts := strings.Split(value, ",")
		for i := range parts {
			parts[i] = strings.TrimSpace(parts[i])
		}
		return parts
	}
	return fallback
}

func corsMiddleware() gin.HandlerFunc {
	allowedOriginsStr := getEnv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173")
	allowedOrigins := strings.Split(allowedOriginsStr, ",")
	allowedMap := make(map[string]bool)
	for _, o := range allowedOrigins {
		allowedMap[strings.TrimSpace(o)] = true
	}

	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if origin != "" && (allowedMap[origin] || allowedMap["*"]) {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
			c.Header("Access-Control-Allow-Credentials", "true")
		} else if origin != "" && len(allowedOrigins) > 0 {
			c.Header("Access-Control-Allow-Origin", allowedOrigins[0])
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Batch-Id, Idempotency-Key")
		c.Header("Access-Control-Max-Age", "86400")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

func authMiddleware(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		// /api/v1/catalog is intentionally NOT bypassed (audit V2: it was wide open
		// and returned fake data). Catalog reads now require a valid JWT and are
		// tenant-scoped like every other protected route.
		bypassed := path == "/v1/health" || path == "/metrics" || path == "/v1/ingest/metrics/batch" || path == "/v1/ingest/logs" || path == "/v1/ingest/logs/stream" || path == "/v1/ingest/traces" || path == "/v1/agent/metrics" || path == "/v1/agent/health" || path == "/v1/telemetry" || strings.HasPrefix(path, "/v1/otel/") || strings.HasPrefix(path, "/api/v1/metrics")
		// Note: /v1/otel/* is bypassed from the JWT check so the OTel Collector
		// (which cannot carry a user JWT) is authenticated by the internal-token
		// middleware on the otelGroup instead (review fix: previously the global
		// auth middleware 401'd token-less OTel requests before the group's
		// internal-token check ever ran).

		auth := c.GetHeader("Authorization")
		if auth == "" {
			cookie, err := c.Cookie("accessToken")
			if err == nil && cookie != "" {
				auth = cookie
			}
		}

		if auth == "" {
			if bypassed {
				c.Next()
				return
			}
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header or cookie"})
			return
		}

		tokenString := auth
		if len(auth) > 7 && auth[:7] == "Bearer " {
			tokenString = auth[7:]
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(secret), nil
		})
		if err != nil || !token.Valid {
			if bypassed {
				c.Next()
				return
			}
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			if bypassed {
				c.Next()
				return
			}
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token claims"})
			return
		}

		c.Set("claims", claims)
		c.Next()
	}
}

func listServices(c *gin.Context, queryService *query.QueryService) {
	tenantID := tenantFromClaims(c)
	services, err := queryService.ListServices(c.Request.Context(), tenantID)
	if err != nil {
		writeEnvelopeOuter(c, http.StatusInternalServerError, nil, gin.H{"error": err.Error()})
		return
	}

	// Enrich each real service with a health score computed from its log stream
	// and a derived status (audit: the frontend filters on svc.status and the
	// Status-page banner lies when status is absent). Status mirrors
	// getServiceHealth so list and detail always agree.
	result := make([]gin.H, 0, len(services))
	for _, id := range services {
		healthScore, err := queryService.ServiceHealth(c.Request.Context(), tenantID, id, 15*time.Minute)
		if err != nil {
			healthScore = 0
		}
		result = append(result, gin.H{
			"id":          id,
			"name":        id,
			"team":        "",
			"tier":        "",
			"status":      deriveStatus(healthScore),
			"healthScore": int(healthScore),
		})
	}
	writeEnvelopeOuter(c, http.StatusOK, gin.H{"services": result}, nil)
}

func getServiceDetail(c *gin.Context, queryService *query.QueryService) {
	serviceID := c.Param("id")
	tenantID := tenantFromClaims(c)

	services, err := queryService.ListServices(c.Request.Context(), tenantID)
	if err != nil {
		writeEnvelopeOuter(c, http.StatusInternalServerError, nil, gin.H{"error": err.Error()})
		return
	}
	found := false
	for _, id := range services {
		if id == serviceID {
			found = true
			break
		}
	}
	if !found {
		writeEnvelopeOuter(c, http.StatusNotFound, nil, gin.H{"error": "service not found in ingested telemetry"})
		return
	}

	healthScore, err := queryService.ServiceHealth(c.Request.Context(), tenantID, serviceID, 15*time.Minute)
	if err != nil {
		healthScore = 0
	}
	writeEnvelopeOuter(c, http.StatusOK, gin.H{
		"id":          serviceID,
		"name":        serviceID,
		"team":        "",
		"tier":        "",
		"healthScore": int(healthScore),
		"endpoints":   []string{},
	}, nil)
}

func createService(c *gin.Context) {
	// No service-registry persistence exists in the collector — the catalog is a
	// read-side view of ingested telemetry. Honest failure instead of fake success.
	writeEnvelopeOuter(c, http.StatusNotImplemented, nil, gin.H{"error": "service registration is not supported; the catalog is derived from ingested telemetry"})
}

func getServiceHealth(c *gin.Context, queryService *query.QueryService) {
	serviceID := c.Param("id")
	tenantID := tenantFromClaims(c)

	healthScore, err := queryService.ServiceHealth(c.Request.Context(), tenantID, serviceID, 15*time.Minute)
	if err != nil {
		writeEnvelopeOuter(c, http.StatusInternalServerError, nil, gin.H{"error": err.Error()})
		return
	}
	writeEnvelopeOuter(c, http.StatusOK, gin.H{
		"id":          serviceID,
		"status":      deriveStatus(healthScore),
		"healthScore": int(healthScore),
	}, nil)
}

func updateService(c *gin.Context) {
	serviceID := c.Param("id")
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeOuter(c, http.StatusBadRequest, nil, gin.H{"error": "invalid payload"})
		return
	}
	// No registry store — refuse to fake an update.
	writeEnvelopeOuter(c, http.StatusNotImplemented, nil, gin.H{"error": "service updates are not supported; the catalog is derived from ingested telemetry", "id": serviceID})
}

// deriveStatus maps a 0-100 health score to the status enum the frontend
// renders (HEALTHY / DEGRADED / CRITICAL). The thresholds mirror the old
// getServiceHealth logic so list, detail and health endpoints never disagree.
func deriveStatus(healthScore float64) string {
	if healthScore >= 60 {
		return "HEALTHY"
	}
	if healthScore >= 30 {
		return "DEGRADED"
	}
	return "CRITICAL"
}

func getServiceDependencies(c *gin.Context, queryService *query.QueryService) {
	serviceID := c.Param("id")
	tenantID := tenantFromClaims(c)
	deps, err := queryService.ListDependencies(c.Request.Context(), tenantID, serviceID)
	if err != nil {
		writeEnvelopeOuter(c, http.StatusInternalServerError, nil, gin.H{"error": err.Error()})
		return
	}
	// Real edges derived from trace parent/child span links — honest empty list
	// when no trace data has been ingested (audit: this endpoint previously
	// fabricated postgres/redis edges for every service).
	writeEnvelopeOuter(c, http.StatusOK, gin.H{
		"id":           serviceID,
		"dependencies": deps,
	}, nil)
}

func submitServiceScorecard(c *gin.Context) {
	serviceID := c.Param("id")
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelopeOuter(c, http.StatusBadRequest, nil, gin.H{"error": "invalid payload"})
		return
	}
	// No scorecard store — refuse to fake a submission.
	writeEnvelopeOuter(c, http.StatusNotImplemented, nil, gin.H{"error": "scorecards are not supported; no persistence exists", "id": serviceID})
}


// ── Log / trace query handlers (audit F7) ─────────────────────────────────

func parseRange(c *gin.Context) (time.Time, time.Time) {
	now := time.Now().UTC()
	from, _ := time.Parse(time.RFC3339, c.Query("from"))
	to, _ := time.Parse(time.RFC3339, c.Query("to"))
	if to.IsZero() {
		to = now
	}
	if from.IsZero() {
		from = to.Add(-1 * time.Hour)
	}
	return from, to
}

// tenantFromClaims extracts the tenantId (or teamId fallback) from the JWT set
// by authMiddleware. Queries are tenant-scoped so one tenant can never read
// another's logs/traces/metrics (audit V5).
func tenantFromClaims(c *gin.Context) string {
	claims, exists := c.Get("claims")
	if !exists {
		return ""
	}
	jwtClaims, ok := claims.(jwt.MapClaims)
	if !ok {
		return ""
	}
	tenant, _ := jwtClaims["tenantId"].(string)
	if tenant == "" {
		tenant, _ = jwtClaims["teamId"].(string)
	}
	if tenant == "" {
		tenant = "default"
	}
	return tenant
}

func handleLogQuery(c *gin.Context, queryService *query.QueryService) {
	from, to := parseRange(c)
	tenantID := tenantFromClaims(c)
	serviceID := c.Query("service")
	level := c.Query("level")
	q := c.Query("q")
	limit := 200
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}

	results, err := queryService.QueryLogsTenant(c.Request.Context(), tenantID, serviceID, level, q, from, to, limit)
	if err != nil {
		writeEnvelopeOuter(c, http.StatusInternalServerError, nil, gin.H{"error": err.Error()})
		return
	}
	writeEnvelopeOuter(c, http.StatusOK, gin.H{"items": results}, nil)
}

func handleTraceQuery(c *gin.Context, queryService *query.QueryService) {
	from, to := parseRange(c)
	tenantID := tenantFromClaims(c)
	serviceID := c.Query("service")
	traceID := c.Query("q")
	limit := 100
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}

	results, err := queryService.QueryTracesTenant(c.Request.Context(), tenantID, serviceID, traceID, from, to, limit)
	if err != nil {
		writeEnvelopeOuter(c, http.StatusInternalServerError, nil, gin.H{"error": err.Error()})
		return
	}
	writeEnvelopeOuter(c, http.StatusOK, gin.H{"items": results}, nil)
}

func internalTokenMiddleware() gin.HandlerFunc {
	expected := os.Getenv("INTERNAL_API_TOKEN")
	return func(c *gin.Context) {
		if expected == "" {
			writeEnvelopeOuter(c, http.StatusServiceUnavailable, nil, gin.H{"error": "INTERNAL_API_TOKEN not configured on collector"})
			c.Abort()
			return
		}
		provided := c.GetHeader("X-Internal-Token")
		if provided != expected {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid internal token"})
			return
		}
		c.Next()
	}
}

func traceMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		traceID := c.GetHeader("X-Trace-Id")
		if traceID == "" {
			traceID = uuid.New().String()
		}
		c.Set("traceId", traceID)
		c.Header("X-Trace-Id", traceID)
		c.Next()
	}
}

type outerEnvelope struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   interface{} `json:"error"`
	Meta    struct {
		Timestamp string `json:"timestamp"`
		TraceID   string `json:"traceId,omitempty"`
	} `json:"meta"`
}

func writeEnvelopeOuter(c *gin.Context, status int, data interface{}, errData interface{}) {
	env := outerEnvelope{
		Success: status >= 200 && status < 300,
		Data:    data,
		Error:   errData,
	}
	env.Meta.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	if tid, ok := c.Get("traceId"); ok {
		env.Meta.TraceID = tid.(string)
	}
	c.JSON(status, env)
}



