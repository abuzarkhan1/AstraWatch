package pkg

import (
	"bufio"
	"encoding/json"
	"io"
	"time"
)

type MetricPoint struct {
	Timestamp time.Time         `json:"ts"`
	Name      string            `json:"name"`
	Value     float64           `json:"value"`
	Labels    map[string]string `json:"labels"`
}

type MetricBatch struct {
	BatchID    string        `json:"batchId,omitempty"`
	TenantID   string        `json:"tenantId,omitempty"`
	ServiceID  string        `json:"serviceId"`
	Cluster    string        `json:"cluster"`
	Namespace  string        `json:"namespace"`
	Metrics    []MetricPoint `json:"metrics"`
	Source     string        `json:"source"`
	ReceivedAt time.Time     `json:"receivedAt"`
}

type LogEntry struct {
	Timestamp time.Time         `json:"ts"`
	TenantID  string            `json:"tenantId,omitempty"`
	ServiceID string            `json:"serviceId"`
	Namespace string            `json:"namespace,omitempty"`
	Message   string            `json:"message"`
	Level     string            `json:"level"`
	Labels    map[string]string `json:"labels"`
	TraceID   string            `json:"traceId,omitempty"`
	PIIMasked bool              `json:"piiMasked,omitempty"`
}

type TraceSpan struct {
	TraceID      string            `json:"traceId"`
	SpanID       string            `json:"spanId"`
	ParentSpanID string            `json:"parentSpanId,omitempty"`
	TenantID     string            `json:"tenantId,omitempty"`
	ServiceID    string            `json:"serviceId"`
	Namespace    string            `json:"namespace,omitempty"`
	Operation    string            `json:"operation"`
	StartTime    time.Time         `json:"startTime"`
	EndTime      time.Time         `json:"endTime"`
	Status       string            `json:"status"`
	Tags         map[string]string `json:"tags"`
}

type NDJSONScanner struct {
	scanner *bufio.Scanner
}

func NewNDJSONScanner(r io.Reader) *NDJSONScanner {
	return &NDJSONScanner{scanner: bufio.NewScanner(r)}
}

func (s *NDJSONScanner) Scan() bool {
	return s.scanner.Scan()
}

func (s *NDJSONScanner) Bytes() []byte {
	return s.scanner.Bytes()
}

func ParseLogLine(data []byte) (*LogEntry, error) {
	var entry LogEntry
	if err := json.Unmarshal(data, &entry); err != nil {
		return nil, err
	}
	return &entry, nil
}

type OTLPTrace struct {
	ResourceSpans []ResourceSpan `json:"resourceSpans"`
}

type ResourceSpan struct {
	Resource   Resource `json:"resource"`
	ScopeSpans []Span   `json:"scopeSpans"`
}

type Resource struct {
	Attributes map[string]string `json:"attributes"`
}

type Span struct {
	TraceID      string            `json:"traceId"`
	SpanID       string            `json:"spanId"`
	ParentSpanID string            `json:"parentSpanId"`
	Name         string            `json:"name"`
	StartTime    time.Time         `json:"startTime"`
	EndTime      time.Time         `json:"endTime"`
	Status       SpanStatus        `json:"status"`
	Attributes   map[string]string `json:"attributes"`
}

type SpanStatus struct {
	Code        string `json:"code"`
	Description string `json:"description,omitempty"`
}

func ParseOTLP(data []byte) ([]TraceSpan, error) {
	var otlp OTLPTrace
	if err := json.Unmarshal(data, &otlp); err != nil {
		return nil, err
	}

	var spans []TraceSpan
	for _, rs := range otlp.ResourceSpans {
		serviceID := rs.Resource.Attributes["service.name"]
		for _, ss := range rs.ScopeSpans {
			spans = append(spans, convertSpan(ss, serviceID))
		}
	}
	return spans, nil
}

func convertSpan(s Span, serviceID string) TraceSpan {
	return TraceSpan{
		TraceID:      s.TraceID,
		SpanID:       s.SpanID,
		ParentSpanID: s.ParentSpanID,
		ServiceID:    serviceID,
		Operation:    s.Name,
		StartTime:    s.StartTime,
		EndTime:      s.EndTime,
		Status:       s.Status.Code,
		Tags:         s.Attributes,
	}
}

type QueryResult struct {
	ServiceID string           `json:"serviceId"`
	Metric    string           `json:"metric"`
	Series    []TimeSeriesPoint `json:"series"`
}

type TimeSeriesPoint struct {
	Timestamp time.Time `json:"ts"`
	Value     float64   `json:"value"`
}

type ValidationError struct {
	Index int    `json:"index"`
	Field string `json:"field"`
	Error string `json:"error"`
}
