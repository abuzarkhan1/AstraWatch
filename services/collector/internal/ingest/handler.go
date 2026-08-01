package ingest

import (
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/astrawatch/collector/internal/enrich"
	"github.com/astrawatch/collector/internal/ingest/agentproto"
	"github.com/astrawatch/collector/internal/produce"
	"github.com/astrawatch/collector/internal/ratelimit"
	"github.com/astrawatch/collector/internal/validate"
	"github.com/astrawatch/collector/pkg"
	"github.com/klauspost/compress/zstd"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"
)

type Handler struct {
	producer  *produce.Producer
	enricher  *enrich.Enricher
	validator *validate.Validator
	limiter   *ratelimit.RateLimiter
	batchChan chan pkg.MetricBatch
	logChan   chan *pkg.LogEntry
	log       *zap.Logger
}

func NewHandler(producer *produce.Producer, enricher *enrich.Enricher, validator *validate.Validator, limiter *ratelimit.RateLimiter, log *zap.Logger) *Handler {
	return &Handler{
		producer:  producer,
		enricher:  enricher,
		validator: validator,
		limiter:   limiter,
		batchChan: make(chan pkg.MetricBatch, 10000),
		logChan:   make(chan *pkg.LogEntry, 10000),
		log:       log,
	}
}

func (h *Handler) StartWorkerPool(numWorkers int) {
	for i := 0; i < numWorkers; i++ {
		go h.worker()
		go h.logWorker()
	}
}

func (h *Handler) worker() {
	for batch := range h.batchChan {
		if err := h.producer.ProduceMetrics(batch); err != nil {
			h.log.Error("failed to produce metrics", zap.Error(err))
		}
	}
}

func (h *Handler) logWorker() {
	for entry := range h.logChan {
		if err := h.producer.ProduceLog(entry); err != nil {
			h.log.Error("failed to produce log", zap.Error(err))
		}
	}
}

func (h *Handler) checkIdempotency(c *gin.Context) bool {
	key := c.GetHeader("Idempotency-Key")
	if key == "" {
		return true
	}
	if h.producer.IsDuplicate(key) {
		writeEnvelope(c, http.StatusConflict, nil, gin.H{"error": "idempotency key already processed"})
		return false
	}
	return true
}

func (h *Handler) IngestMetricsBatch(c *gin.Context) {
	tenantID, err := extractTenant(c)
	if err != nil {
		writeEnvelope(c, http.StatusUnauthorized, nil, gin.H{"error": err.Error()})
		return
	}

	if !h.limiter.Allow(tenantID) {
		c.Header("Retry-After", "1")
		writeEnvelope(c, http.StatusTooManyRequests, nil, gin.H{"error": "rate limit exceeded"})
		return
	}

	if !h.checkIdempotency(c) {
		return
	}

	contentEncoding := c.GetHeader("Content-Encoding")
	var reader io.Reader = c.Request.Body
	switch contentEncoding {
	case "gzip":
		gr, err := gzip.NewReader(reader)
		if err != nil {
			writeEnvelope(c, http.StatusBadRequest, nil, gin.H{"error": "invalid gzip"})
			return
		}
		defer gr.Close()
		reader = gr
	case "zstd":
		zr, err := zstd.NewReader(reader)
		if err != nil {
			writeEnvelope(c, http.StatusBadRequest, nil, gin.H{"error": "invalid zstd"})
			return
		}
		defer zr.Close()
		reader = zr
	}

	body, err := io.ReadAll(reader)
	if err != nil {
		writeEnvelope(c, http.StatusBadRequest, nil, gin.H{"error": "cannot read body"})
		return
	}

	if len(body) > 5*1024*1024 {
		writeEnvelope(c, http.StatusRequestEntityTooLarge, nil, gin.H{"error": "body exceeds 5MB limit"})
		return
	}

	batchID := c.GetHeader("X-Batch-Id")
	if batchID != "" {
		if h.producer.IsDuplicate(batchID) {
			writeEnvelope(c, http.StatusAccepted, gin.H{"accepted": 0, "rejected": 0, "duplicate": true}, nil)
			return
		}
	}

	contentType := c.GetHeader("Content-Type")
	var batch pkg.MetricBatch

	if contentType == "application/x-protobuf" || contentType == "application/protobuf" {
		var protoBatch agentproto.MetricBatch
		if err := proto.Unmarshal(body, &protoBatch); err != nil {
			writeEnvelope(c, http.StatusBadRequest, nil, gin.H{"error": "invalid protobuf: " + err.Error()})
			return
		}
		batch = protoBatchToPkg(&protoBatch)
	} else {
		if err := json.Unmarshal(body, &batch); err != nil {
			writeEnvelope(c, http.StatusBadRequest, nil, gin.H{"error": "invalid JSON: " + err.Error()})
			return
		}
	}

	batch.TenantID = tenantID

	valid, rejected := h.validator.ValidateBatch(batch)
	if len(valid.Metrics) == 0 {
		writeEnvelope(c, http.StatusBadRequest, gin.H{"accepted": 0, "rejected": len(rejected), "errors": rejected}, nil)
		return
	}

	h.enricher.EnrichBatch(&valid)

	select {
	case h.batchChan <- valid:
	default:
		c.Header("Retry-After", "1")
		writeEnvelope(c, http.StatusTooManyRequests, nil, gin.H{"error": "server busy, retry later"})
		return
	}

	writeEnvelope(c, http.StatusAccepted, gin.H{"accepted": len(valid.Metrics), "rejected": len(rejected)}, nil)
}

func protoBatchToPkg(pb *agentproto.MetricBatch) pkg.MetricBatch {
	metrics := make([]pkg.MetricPoint, len(pb.Metrics))
	for i, m := range pb.Metrics {
		ts := time.Now()
		if m.Timestamp != nil {
			ts = m.Timestamp.AsTime()
		}
		metrics[i] = pkg.MetricPoint{
			Name:      m.Name,
			Value:     m.Value,
			Timestamp: ts,
			Labels:    m.Labels,
		}
	}
	return pkg.MetricBatch{
		ServiceID: pb.GetAgentId(),
		Cluster:   pb.GetCluster(),
		Metrics:   metrics,
		Source:    "protobuf",
	}
}

func (h *Handler) IngestLogsStream(c *gin.Context) {
	tenantID, err := extractTenant(c)
	if err != nil {
		writeEnvelope(c, http.StatusUnauthorized, nil, gin.H{"error": err.Error()})
		return
	}
	if !h.limiter.Allow(tenantID) {
		c.Header("Retry-After", "1")
		writeEnvelope(c, http.StatusTooManyRequests, nil, gin.H{"error": "rate limit exceeded"})
		return
	}

	if !h.checkIdempotency(c) {
		return
	}

	var decoder io.Reader = c.Request.Body
	contentEncoding := c.GetHeader("Content-Encoding")
	switch contentEncoding {
	case "gzip":
		gr, err := gzip.NewReader(decoder)
		if err != nil {
			writeEnvelope(c, http.StatusBadRequest, nil, gin.H{"error": "invalid gzip"})
			return
		}
		defer gr.Close()
		decoder = gr
	case "zstd":
		zr, err := zstd.NewReader(decoder)
		if err != nil {
			writeEnvelope(c, http.StatusBadRequest, nil, gin.H{"error": "invalid zstd"})
			return
		}
		defer zr.Close()
		decoder = zr
	}

	scanner := pkg.NewNDJSONScanner(decoder)
	var accepted, rejected int
	for scanner.Scan() {
		line := scanner.Bytes()
		logEntry, err := pkg.ParseLogLine(line)
		if err != nil {
			rejected++
			continue
		}
		if errs := h.validator.ValidateLog(logEntry); len(errs) > 0 {
			rejected++
			continue
		}
		logEntry.TenantID = tenantID
		h.enricher.EnrichLog(logEntry)

		select {
		case h.logChan <- logEntry:
			accepted++
		default:
			h.log.Warn("log worker channel full, dropping log entry")
			rejected++
		}
	}

	writeEnvelope(c, http.StatusAccepted, gin.H{"accepted": accepted, "rejected": rejected}, nil)
}

func (h *Handler) IngestTraces(c *gin.Context) {
	tenantID, err := extractTenant(c)
	if err != nil {
		writeEnvelope(c, http.StatusUnauthorized, nil, gin.H{"error": err.Error()})
		return
	}
	if !h.limiter.Allow(tenantID) {
		c.Header("Retry-After", "1")
		writeEnvelope(c, http.StatusTooManyRequests, nil, gin.H{"error": "rate limit exceeded"})
		return
	}

	if !h.checkIdempotency(c) {
		return
	}

	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		writeEnvelope(c, http.StatusBadRequest, nil, gin.H{"error": "cannot read body"})
		return
	}

	if len(body) > 10*1024*1024 {
		writeEnvelope(c, http.StatusRequestEntityTooLarge, nil, gin.H{"error": "body exceeds 10MB limit"})
		return
	}

	traces, err := pkg.ParseOTLP(body)
	if err != nil {
		writeEnvelope(c, http.StatusBadRequest, nil, gin.H{"error": "invalid OTLP: " + err.Error()})
		return
	}

	for _, trace := range traces {
		trace.TenantID = tenantID
		h.enricher.EnrichTrace(&trace)
		if err := h.producer.ProduceTrace(trace); err != nil {
			h.log.Error("failed to produce trace", zap.Error(err))
		}
	}

	writeEnvelope(c, http.StatusAccepted, gin.H{"accepted": len(traces)}, nil)
}

func (h *Handler) HealthCheck(c *gin.Context) {
	lag, err := h.producer.GetKafkaLag()
	status := "healthy"
	if err != nil {
		status = "degraded"
	}

	writeEnvelope(c, http.StatusOK, gin.H{
		"status":   status,
		"uptime":   time.Since(startTime).String(),
		"kafkaLag": lag,
	}, nil)
}

type Envelope struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   interface{} `json:"error"`
	Meta    struct {
		Timestamp string `json:"timestamp"`
		TraceID   string `json:"traceId,omitempty"`
	} `json:"meta"`
}

func writeEnvelope(c *gin.Context, status int, data interface{}, errData interface{}) {
	env := Envelope{
		Success: status >= 200 && status < 300,
		Data:    data,
		Error:   errData,
	}
	env.Meta.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	traceID := c.GetString("traceId")
	if traceID != "" {
		env.Meta.TraceID = traceID
	}
	c.JSON(status, env)
}

var startTime time.Time

func init() {
	startTime = time.Now()
}

func extractTenant(c *gin.Context) (string, error) {
	claims, exists := c.Get("claims")
	if !exists {
		return "", fmt.Errorf("authentication required: missing JWT claims")
	}
	jwtClaims, ok := claims.(jwt.MapClaims)
	if !ok {
		return "", fmt.Errorf("authentication failed: invalid claims format")
	}
	tenant, _ := jwtClaims["tenantId"].(string)
	if tenant == "" {
		// Backward-compatible fallback for tokens that carry teamId but no tenantId.
		tenant, _ = jwtClaims["teamId"].(string)
	}
	if tenant == "" {
		tenant = "default"
	}
	return tenant, nil
}
