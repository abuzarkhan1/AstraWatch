package ingest

import (
	"compress/gzip"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/astrawatch/collector/internal/enrich"
	"github.com/astrawatch/collector/internal/produce"
	"github.com/astrawatch/collector/internal/ratelimit"
	"github.com/astrawatch/collector/internal/validate"
	"github.com/astrawatch/collector/pkg"
	"github.com/klauspost/compress/zstd"
)

type AgentMetricBatch struct {
	AgentID             string            `json:"agentId"`
	Hostname            string            `json:"hostname"`
	Cluster             string            `json:"cluster"`
	Metrics             []AgentMetricPoint `json:"metrics"`
	BatchSeq            int64             `json:"batchSeq"`
	OriginalTimestampMs int64             `json:"originalTimestampMs"`
	IsBacklog           bool              `json:"isBacklog"`
	QueueDepth          int64             `json:"queueDepth"`
}

type AgentMetricPoint struct {
	Name      string            `json:"name"`
	Value     float64           `json:"value"`
	Timestamp int64             `json:"timestampMs"`
	Labels    map[string]string `json:"labels"`
}

type pkgMetricPoint = pkg.MetricPoint

type AgentHandler struct {
	producer  *produce.Producer
	enricher  *enrich.Enricher
	validator *validate.Validator
	limiter   *ratelimit.RateLimiter
}

func NewAgentHandler(producer *produce.Producer, enricher *enrich.Enricher, validator *validate.Validator, limiter *ratelimit.RateLimiter) *AgentHandler {
	return &AgentHandler{
		producer:  producer,
		enricher:  enricher,
		validator: validator,
		limiter:   limiter,
	}
}

func (h *AgentHandler) processMetricPoint(mp pkg.MetricPoint, serviceID string, tenantID string) error {
	metricBatch := pkg.MetricBatch{
		TenantID:  tenantID,
		ServiceID: serviceID,
		Metrics:   []pkg.MetricPoint{mp},
	}

	valid, rejections := h.validator.ValidateBatch(metricBatch)
	if len(rejections) > 0 {
		return nil
	}

	h.enricher.EnrichBatch(&valid)
	return h.producer.ProduceMetrics(valid)
}

func (h *AgentHandler) HandleAgentBatch(c *gin.Context) {
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

	if !checkIdempotencyOuter(h.producer, c) {
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

	var agentBatch AgentMetricBatch
	if err := json.Unmarshal(body, &agentBatch); err != nil {
		writeEnvelope(c, http.StatusBadRequest, nil, gin.H{"error": "invalid JSON: " + err.Error()})
		return
	}

	log.Printf("Agent batch from %s/%s: %d metrics, seq=%d, backlog=%v",
		agentBatch.AgentID, agentBatch.Hostname,
		len(agentBatch.Metrics), agentBatch.BatchSeq, agentBatch.IsBacklog)

	var accepted, rejected int
	for _, mp := range agentBatch.Metrics {
		ts := time.UnixMilli(mp.Timestamp)

		labels := mp.Labels
		if labels == nil {
			labels = make(map[string]string)
		}
		labels["source"] = "cxx-agent"
		labels["agent_id"] = agentBatch.AgentID
		labels["host"] = agentBatch.Hostname
		if agentBatch.IsBacklog {
			labels["is_backlog"] = "true"
		}

		pmp := pkg.MetricPoint{
			Name:      mp.Name,
			Value:     mp.Value,
			Timestamp: ts,
			Labels:    labels,
		}

		if err := h.processMetricPoint(pmp, agentBatch.AgentID, tenantID); err != nil {
			log.Printf("Failed to produce agent metric: %v", err)
			rejected++
			continue
		}
		accepted++
	}

	writeEnvelope(c, http.StatusAccepted, gin.H{
		"accepted": accepted,
		"rejected": rejected,
		"agentId":  agentBatch.AgentID,
	}, nil)
}

func (h *AgentHandler) HandleAgentHealth(c *gin.Context) {
	writeEnvelope(c, http.StatusOK, gin.H{
		"status":        "HEALTHY",
		"uptimeSeconds": int64(time.Since(startTime).Seconds()),
	}, nil)
}

func checkIdempotencyOuter(producer *produce.Producer, c *gin.Context) bool {
	key := c.GetHeader("Idempotency-Key")
	if key == "" {
		return true
	}
	if producer.IsDuplicate(key) {
		writeEnvelope(c, http.StatusConflict, nil, gin.H{"error": "idempotency key already processed"})
		return false
	}
	return true
}
