package catalog

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	// Add dependencies like db here later if needed
}

func NewHandler() *Handler {
	return &Handler{}
}

// NOTE: this package is not wired to any route today (the catalog routes in
// cmd/collector/main.go use query-service backed handlers). It is kept honest
// so no fabricated data exists anywhere in the codebase: updates, scorecards
// and dependencies all refuse to fake success.

func (h *Handler) UpdateService(c *gin.Context) {
	serviceID := c.Param("id")
	// No registry store exists — the catalog is a read-side view of telemetry.
	writeEnvelope(c, http.StatusNotImplemented, gin.H{"error": "service updates are not supported; the catalog is derived from ingested telemetry", "id": serviceID}, nil)
}

func (h *Handler) GetServiceDependencies(c *gin.Context) {
	serviceID := c.Param("id")
	// Honest empty list — dependency edges are derived from trace data by the
	// query service (see query.ListDependencies); never fabricated here.
	writeEnvelope(c, http.StatusOK, gin.H{"id": serviceID, "dependencies": []gin.H{}}, nil)
}

func (h *Handler) SubmitServiceScorecard(c *gin.Context) {
	serviceID := c.Param("id")
	writeEnvelope(c, http.StatusNotImplemented, gin.H{"error": "scorecards are not supported; no persistence exists", "id": serviceID}, nil)
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
	if traceID, ok := c.Get("traceId"); ok {
		env.Meta.TraceID = traceID.(string)
	}
	c.JSON(status, env)
}
