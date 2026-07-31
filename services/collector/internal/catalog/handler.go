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

func (h *Handler) UpdateService(c *gin.Context) {
	serviceID := c.Param("id")
	
	// Parse body
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelope(c, http.StatusBadRequest, nil, gin.H{"error": "invalid payload"})
		return
	}

	writeEnvelope(c, http.StatusOK, gin.H{
		"id":      serviceID,
		"message": "service updated successfully",
		"updated": req,
	}, nil)
}

func (h *Handler) GetServiceDependencies(c *gin.Context) {
	serviceID := c.Param("id")
	writeEnvelope(c, http.StatusOK, gin.H{
		"id": serviceID,
		"dependencies": []gin.H{
			{"id": "svc-db", "name": "postgres-primary", "type": "database"},
			{"id": "svc-redis", "name": "redis-cache", "type": "cache"},
		},
	}, nil)
}

func (h *Handler) SubmitServiceScorecard(c *gin.Context) {
	serviceID := c.Param("id")
	
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		writeEnvelope(c, http.StatusBadRequest, nil, gin.H{"error": "invalid payload"})
		return
	}

	writeEnvelope(c, http.StatusOK, gin.H{
		"id":      serviceID,
		"message": "scorecard submitted successfully",
		"scorecard": req,
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
	if traceID, ok := c.Get("traceId"); ok {
		env.Meta.TraceID = traceID.(string)
	}
	c.JSON(status, env)
}
