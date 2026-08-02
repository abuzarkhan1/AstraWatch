package pkg

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
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

type OTLPLogs struct {
	ResourceLogs []ResourceLog `json:"resourceLogs"`
}

type ResourceLog struct {
	Resource     Resource   `json:"resource"`
	ScopeLogs    []ScopeLog `json:"scopeLogs"`
}

type ScopeLog struct {
	LogRecords []LogRecord `json:"logRecords"`
}

type LogRecord struct {
	TimeUnixNano   string         `json:"timeUnixNano"`
	ObservedTime   string         `json:"observedTimeUnixNano"`
	SeverityNumber int            `json:"severityNumber"`
	SeverityText   string         `json:"severityText"`
	Body           map[string]any `json:"body"`
	Attributes     map[string]any `json:"attributes"`
	TraceID        string         `json:"traceId"`
	SpanID         string         `json:"spanId"`
}

type OTLPMetrics struct {
	ResourceMetrics []ResourceMetric `json:"resourceMetrics"`
}

type ResourceMetric struct {
	Resource     Resource       `json:"resource"`
	ScopeMetrics []ScopeMetric  `json:"scopeMetrics"`
}

type ScopeMetric struct {
	Metrics []OTLPMetric `json:"metrics"`
}

type OTLPMetric struct {
	Name      string     `json:"name"`
	Gauge     *GaugeData `json:"gauge"`
	Sum       *SumData   `json:"sum"`
}

type GaugeData struct {
	DataPoints []DataPoint `json:"dataPoints"`
}

type SumData struct {
	DataPoints []DataPoint `json:"dataPoints"`
}

type DataPoint struct {
	TimeUnixNano string         `json:"timeUnixNano"`
	AsDouble     *float64       `json:"asDouble"`
	AsInt        *int64         `json:"asInt"`
	Attributes   map[string]any `json:"attributes"`
}

// ParseOTLPLogs converts an OTLP/JSON logs payload into collector LogEntry rows.
func ParseOTLPLogs(data []byte) ([]LogEntry, error) {
	var otlp OTLPLogs
	if err := json.Unmarshal(data, &otlp); err != nil {
		return nil, err
	}

	var entries []LogEntry
	for _, rl := range otlp.ResourceLogs {
		serviceID := stringifyAttribute(rl.Resource.Attributes["service.name"])
		for _, sl := range rl.ScopeLogs {
			for _, lr := range sl.LogRecords {
				entries = append(entries, LogEntry{
					Timestamp: otlpNanosToTime(lr.TimeUnixNano),
					ServiceID: serviceID,
					Message:   otlpBodyToString(lr.Body),
					Level:     normalizeLevel(lr.SeverityText, lr.SeverityNumber),
					Labels:    stringifyAttributes(lr.Attributes),
					TraceID:   lr.TraceID,
				})
			}
		}
	}
	return entries, nil
}

// ParseOTLPMetrics converts an OTLP/JSON metrics payload into a MetricBatch
// (sum + gauge data points only — the standard OTLP exporters' shape).
func ParseOTLPMetrics(data []byte) ([]MetricBatch, error) {
	var otlp OTLPMetrics
	if err := json.Unmarshal(data, &otlp); err != nil {
		return nil, err
	}

	var batches []MetricBatch
	for _, rm := range otlp.ResourceMetrics {
		serviceID := stringifyAttribute(rm.Resource.Attributes["service.name"])
		for _, sm := range rm.ScopeMetrics {
			for _, m := range sm.Metrics {
				points := []DataPoint{}
				if m.Gauge != nil {
					points = m.Gauge.DataPoints
				} else if m.Sum != nil {
					points = m.Sum.DataPoints
				}
				for _, dp := range points {
					var val float64
					if dp.AsDouble != nil {
						val = *dp.AsDouble
					} else if dp.AsInt != nil {
						val = float64(*dp.AsInt)
					} else {
						continue
					}
					batches = append(batches, MetricBatch{
						ServiceID: serviceID,
						Metrics: []MetricPoint{{
							Timestamp: otlpNanosToTime(dp.TimeUnixNano),
							Name:      m.Name,
							Value:     val,
							Labels:    stringifyAttributes(dp.Attributes),
						}},
					})
				}
			}
		}
	}
	return batches, nil
}

// stringifyAttribute converts an OTLP AnyValue (or a plain scalar) into its
// string form. OTLP/JSON attributes are AnyValue objects like {"stringValue":"x"}
// or {"intValue":"5"}; the collector stores labels as flat string maps.
func stringifyAttribute(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case map[string]any:
		for _, k := range []string{"stringValue", "intValue", "doubleValue", "boolValue"} {
			if sv, ok := t[k]; ok && sv != nil {
				return fmt.Sprint(sv)
			}
		}
		// fall through to JSON of the whole AnyValue
		if b, err := json.Marshal(t); err == nil {
			return string(b)
		}
		return ""
	default:
		return fmt.Sprint(t)
	}
}

func stringifyAttributes(attrs map[string]any) map[string]string {
	if len(attrs) == 0 {
		return nil
	}
	out := make(map[string]string, len(attrs))
	for k, v := range attrs {
		out[k] = stringifyAttribute(v)
	}
	return out
}

func otlpNanosToTime(nanos string) time.Time {
	if nanos == "" {
		return time.Now()
	}
	if n, err := strconv.ParseInt(nanos, 10, 64); err == nil {
		return time.Unix(0, n)
	}
	return time.Now()
}

func otlpBodyToString(body map[string]any) string {
	if body == nil {
		return ""
	}
	// OTLP AnyValue string body: {"stringValue":"..."}
	if sv, ok := body["stringValue"].(string); ok {
		return sv
	}
	if b, err := json.Marshal(body); err == nil {
		return string(b)
	}
	return ""
}

func normalizeLevel(severityText string, severityNumber int) string {
	if severityText != "" {
		t := strings.ToLower(severityText)
		if t == "error" || t == "fatal" || t == "critical" {
			return "error"
		}
		if t == "warn" || t == "warning" {
			return "warn"
		}
		if t == "debug" {
			return "debug"
		}
		return "info"
	}
	// OTLP severity numbers: 17-20 trace, 9-12 debug, 13-16 info, 17-20 warn, 21-24 error
	if severityNumber >= 21 {
		return "error"
	}
	if severityNumber >= 17 {
		return "warn"
	}
	if severityNumber >= 13 {
		return "info"
	}
	if severityNumber >= 9 {
		return "debug"
	}
	return "info"
}

type ResourceSpan struct {
	Resource   Resource `json:"resource"`
	ScopeSpans []Span   `json:"scopeSpans"`
}

type Resource struct {
	Attributes map[string]any `json:"attributes"`
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
		serviceID := stringifyAttribute(rs.Resource.Attributes["service.name"])
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
