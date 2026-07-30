package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
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
	"go.uber.org/zap"
)

func main() {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	cfg := loadConfig()

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

	enricher := enrich.NewEnricher()
	validator := validate.NewValidator()
	limiter := ratelimit.NewRateLimiter(1000, 2000)

	handler := ingest.NewHandler(producer, enricher, validator, limiter, logger)
	handler.StartWorkerPool(10)

	queryService := query.NewQueryService(clickConn)

	router := gin.Default()

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

		agentGroup := v1.Group("/agent")
		{
			agentGroup.POST("/metrics", agentHandler.HandleAgentBatch)
			agentGroup.GET("/health", agentHandler.HandleAgentHealth)
		}

		v1.GET("/query", func(c *gin.Context) {
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
				result, err = queryService.QueryMetricsWithStep(c.Request.Context(), serviceID, metric, from, to, dur)
			} else {
				result, err = queryService.QueryMetrics(c.Request.Context(), serviceID, metric, from, to)
			}
			if err != nil {
				writeEnvelopeOuter(c, http.StatusInternalServerError, nil, gin.H{"error": err.Error()})
				return
			}

			writeEnvelopeOuter(c, http.StatusOK, result, nil)
		})

		v1.GET("/health", handler.HealthCheck)
	}

	catalogGroup := router.Group("/api/v1/catalog")
	{
		catalogGroup.GET("/services", listServices)
		catalogGroup.GET("/services/:id", getServiceDetail)
		catalogGroup.POST("/services", createService)
		catalogGroup.GET("/services/:id/health", getServiceHealth)
		catalogGroup.PUT("/services/:id", updateService)
		catalogGroup.GET("/services/:id/dependencies", getServiceDependencies)
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
		Port:              getEnv("PORT", "8080"),
		KafkaBrokers:      getEnvAsSlice("KAFKA_BROKERS", []string{"localhost:9092"}),
		ClickHouseAddr:    getEnv("CLICKHOUSE_ADDR", "localhost:9000"),
		ClickHouseDB:      getEnv("CLICKHOUSE_DB", "astrawatch"),
		ClickHouseUser:    getEnv("CLICKHOUSE_USER", "default"),
		ClickHousePassword: getEnv("CLICKHOUSE_PASSWORD", ""),
		RedisAddr:         getEnv("REDIS_ADDR", "localhost:6379"),
		JWTSecret:         getEnv("JWT_SECRET", "dev-secret-change-in-production"),
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
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
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
		if path == "/v1/health" || path == "/metrics" || path == "/v1/ingest/metrics/batch" || path == "/v1/ingest/logs/stream" || path == "/v1/ingest/traces" || path == "/v1/agent/metrics" || path == "/v1/agent/health" {
			c.Next()
			return
		}

		auth := c.GetHeader("Authorization")
		if auth == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header"})
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
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token claims"})
			return
		}

		c.Set("claims", claims)
		c.Next()
	}
}

func listServices(c *gin.Context) {
	writeEnvelopeOuter(c, http.StatusOK, gin.H{
		"services": []gin.H{
			{"id": "svc-1", "name": "payment-v2", "team": "payments", "tier": "CRITICAL", "healthScore": 98},
			{"id": "svc-2", "name": "user-service", "team": "identity", "tier": "CRITICAL", "healthScore": 95},
			{"id": "svc-3", "name": "notification-svc", "team": "platform", "tier": "HIGH", "healthScore": 87},
		},
	}, nil)
}

func getServiceDetail(c *gin.Context) {
	serviceID := c.Param("id")
	writeEnvelopeOuter(c, http.StatusOK, gin.H{
		"id":        serviceID,
		"name":      serviceID,
		"team":      "unknown",
		"tier":      "MEDIUM",
		"endpoints": []string{},
		"dependencies": []gin.H{
			{"id": "svc-db", "name": "postgres-primary", "type": "database"},
		},
	}, nil)
}

func createService(c *gin.Context) {
	writeEnvelopeOuter(c, http.StatusCreated, gin.H{"id": "svc-new", "message": "service registered"}, nil)
}

func getServiceHealth(c *gin.Context) {
	serviceID := c.Param("id")
	writeEnvelopeOuter(c, http.StatusOK, gin.H{
		"id":          serviceID,
		"status":      "healthy",
		"healthScore": 95,
		"uptime":      "72h",
		"latencyP95":  "45ms",
		"errorRate":   "0.02%",
	}, nil)
}

func updateService(c *gin.Context) {
	serviceID := c.Param("id")
	writeEnvelopeOuter(c, http.StatusOK, gin.H{"id": serviceID, "message": "service updated"}, nil)
}

func getServiceDependencies(c *gin.Context) {
	serviceID := c.Param("id")
	writeEnvelopeOuter(c, http.StatusOK, gin.H{
		"id": serviceID,
		"dependencies": []gin.H{
			{"id": "svc-db", "name": "postgres-primary", "type": "database"},
		},
	}, nil)
}

func submitServiceScorecard(c *gin.Context) {
	serviceID := c.Param("id")
	writeEnvelopeOuter(c, http.StatusOK, gin.H{"id": serviceID, "message": "scorecard submitted"}, nil)
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



