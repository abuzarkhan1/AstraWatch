package query

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/astrawatch/collector/pkg"
)

type QueryService struct {
	conn clickhouse.Conn
}

func NewQueryService(conn clickhouse.Conn) *QueryService {
	return &QueryService{conn: conn}
}

func (qs *QueryService) QueryMetrics(ctx context.Context, serviceID, metric string, from, to time.Time) (*pkg.QueryResult, error) {
	return qs.QueryMetricsTenant(ctx, "", serviceID, metric, from, to)
}

// QueryMetricsTenant enforces tenant isolation (audit V5): when tenantID is
// non-empty the query only returns rows belonging to that tenant. The internal
// operator endpoint passes "" to query across the shared plane.
func (qs *QueryService) QueryMetricsTenant(ctx context.Context, tenantID, serviceID, metric string, from, to time.Time) (*pkg.QueryResult, error) {
	query := `SELECT ts, value FROM metrics
		WHERE service_id = ?
		AND metric_name = ?
		AND ts >= ?
		AND ts <= ?`
	args := []interface{}{serviceID, metric, from, to}
	if tenantID != "" {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	query += " ORDER BY ts ASC"

	rows, err := qs.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	result := &pkg.QueryResult{
		ServiceID: serviceID,
		Metric:    metric,
	}

	for rows.Next() {
		var ts time.Time
		var value float64
		if err := rows.Scan(&ts, &value); err != nil {
			return nil, fmt.Errorf("scan failed: %w", err)
		}
		result.Series = append(result.Series, pkg.TimeSeriesPoint{
			Timestamp: ts,
			Value:     value,
		})
	}

	return result, nil
}

func (qs *QueryService) QueryAggregatedTenant(ctx context.Context, tenantID, serviceID, metric string, from, to time.Time, aggregation string) (float64, error) {
	var aggFunc string
	switch aggregation {
	case "avg":
		aggFunc = "avg(value)"
	case "max":
		aggFunc = "max(value)"
	case "min":
		aggFunc = "min(value)"
	case "p95":
		aggFunc = "quantile(0.95)(value)"
	default:
		aggFunc = "avg(value)"
	}

	query := fmt.Sprintf("SELECT %s FROM metrics WHERE service_id = ? AND metric_name = ? AND ts >= ? AND ts <= ?", aggFunc)
	args := []interface{}{serviceID, metric, from, to}
	if tenantID != "" {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}

	var result float64
	if err := qs.conn.QueryRow(ctx, query, args...).Scan(&result); err != nil {
		return 0, fmt.Errorf("aggregation query failed: %w", err)
	}

	return result, nil
}

func (qs *QueryService) QueryAggregated(ctx context.Context, serviceID, metric string, from, to time.Time, aggregation string) (float64, error) {
	return qs.QueryAggregatedTenant(ctx, "", serviceID, metric, from, to, aggregation)
}

func (qs *QueryService) QueryMetricsWithStep(ctx context.Context, serviceID, metric string, from, to time.Time, step time.Duration) (*pkg.QueryResult, error) {
	return qs.QueryMetricsWithStepTenant(ctx, "", serviceID, metric, from, to, step)
}

func (qs *QueryService) QueryMetricsWithStepTenant(ctx context.Context, tenantID, serviceID, metric string, from, to time.Time, step time.Duration) (*pkg.QueryResult, error) {
	query := `SELECT toStartOfInterval(ts, INTERVAL ? SECOND) AS bucket, avg(value) AS val
		FROM metrics
		WHERE service_id = ? AND metric_name = ? AND ts >= ? AND ts <= ?`
	args := []interface{}{int(step.Seconds()), serviceID, metric, from, to}
	if tenantID != "" {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	query += " GROUP BY bucket ORDER BY bucket ASC"

	rows, err := qs.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query with step failed: %w", err)
	}
	defer rows.Close()

	result := &pkg.QueryResult{
		ServiceID: serviceID,
		Metric:    metric,
	}
	for rows.Next() {
		var ts time.Time
		var value float64
		if err := rows.Scan(&ts, &value); err != nil {
			return nil, fmt.Errorf("scan failed: %w", err)
		}
		result.Series = append(result.Series, pkg.TimeSeriesPoint{Timestamp: ts, Value: value})
	}
	return result, nil
}

func (qs *QueryService) GetLatestMetrics(ctx context.Context, serviceID string, limit int) ([]pkg.TimeSeriesPoint, error) {
	query := `SELECT metric_name, ts, value FROM metrics
		WHERE service_id = ?
		ORDER BY ts DESC LIMIT ?`

	rows, err := qs.conn.Query(ctx, query, serviceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []pkg.TimeSeriesPoint
	for rows.Next() {
		var name string
		var ts time.Time
		var value float64
		if err := rows.Scan(&name, &ts, &value); err != nil {
			return nil, err
		}
		points = append(points, pkg.TimeSeriesPoint{
			Timestamp: ts,
			Value:     value,
		})
	}

	return points, nil
}

// ── Log & trace query API (audit F7 — wire Logs/Traces Explorer) ───────────
// The frontend Logs Explorer and Trace Explorer previously rendered UI with no
// backend behind them. These query the same ClickHouse tables the consumer
// writes, so the explorers show real data. All queries are parameterized.

// LogEntryResult is the response shape consumed by the frontend Logs Explorer.
type LogEntryResult struct {
	ID        string            `json:"id"`
	Timestamp time.Time         `json:"timestamp"`
	Service   string            `json:"service"`
	Level     string            `json:"level"`
	Message   string            `json:"message"`
	TraceID   string            `json:"traceId,omitempty"`
	SpanID    string            `json:"spanId,omitempty"`
	Attributes map[string]string `json:"attributes,omitempty"`
}

func (qs *QueryService) QueryLogs(ctx context.Context, serviceID, level, q string, from, to time.Time, limit int) ([]LogEntryResult, error) {
	return qs.QueryLogsTenant(ctx, "", serviceID, level, q, from, to, limit)
}

// QueryLogsTenant enforces tenant isolation (audit V5): when tenantID is
// non-empty only that tenant's rows are returned.
func (qs *QueryService) QueryLogsTenant(ctx context.Context, tenantID, serviceID, level, q string, from, to time.Time, limit int) ([]LogEntryResult, error) {
	if limit <= 0 || limit > 1000 {
		limit = 200
	}

	query := `SELECT service_id, ts, level, message, trace_id, span_id, attributes
		FROM logs
		WHERE ts >= ? AND ts <= ?`
	args := []interface{}{from, to}

	if tenantID != "" {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	if serviceID != "" {
		query += " AND service_id = ?"
		args = append(args, serviceID)
	}
	if level != "" && level != "all" {
		query += " AND level = ?"
		args = append(args, level)
	}
	if q != "" && q != "all" {
		query += " AND positionCaseInsensitive(message, ?) > 0"
		args = append(args, q)
	}

	query += " ORDER BY ts DESC LIMIT ?"
	args = append(args, limit)

	rows, err := qs.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("log query failed: %w", err)
	}
	defer rows.Close()

	var results []LogEntryResult
	for rows.Next() {
		var service string
		var ts time.Time
		var level, message, traceID, spanID string
		var attributes map[string]string
		if err := rows.Scan(&service, &ts, &level, &message, &traceID, &spanID, &attributes); err != nil {
			return nil, fmt.Errorf("log scan failed: %w", err)
		}
		results = append(results, LogEntryResult{
			ID:         service + "-" + ts.Format("20060102150405") + "-" + traceID,
			Timestamp:  ts,
			Service:    service,
			Level:      level,
			Message:    message,
			TraceID:    traceID,
			SpanID:     spanID,
			Attributes: attributes,
		})
	}

	return results, nil
}

// SpanResult is a single span within a trace.
type SpanResult struct {
	SpanID        string            `json:"spanId"`
	ParentSpanID  string            `json:"parentSpanId,omitempty"`
	OperationName string            `json:"operationName"`
	Service       string            `json:"service"`
	StartTime     time.Time         `json:"startTime"`
	Duration      float64           `json:"duration"`
	Status        string            `json:"status"`
	Tags          map[string]string `json:"tags,omitempty"`
}

// TraceResult groups spans by trace id for the frontend Trace Explorer.
type TraceResult struct {
	TraceID     string        `json:"traceId"`
	Spans       []SpanResult  `json:"spans"`
	StartTime   time.Time     `json:"startTime"`
	Duration    float64       `json:"duration"`
	ServiceCount int          `json:"serviceCount"`
	SpanCount   int           `json:"spanCount"`
}

func (qs *QueryService) QueryTraces(ctx context.Context, serviceID, traceID string, from, to time.Time, limit int) ([]TraceResult, error) {
	return qs.QueryTracesTenant(ctx, "", serviceID, traceID, from, to, limit)
}

// QueryTracesTenant enforces tenant isolation (audit V5).
func (qs *QueryService) QueryTracesTenant(ctx context.Context, tenantID, serviceID, traceID string, from, to time.Time, limit int) ([]TraceResult, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100
	}

	query := `SELECT trace_id, span_id, parent_span_id, service_id, operation_name, start_time, end_time, tags
		FROM traces
		WHERE start_time >= ? AND start_time <= ?`
	args := []interface{}{from, to}

	if tenantID != "" {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}
	if traceID != "" && traceID != "all" {
		query += " AND trace_id = ?"
		args = append(args, traceID)
	}
	if serviceID != "" && serviceID != "all" {
		query += " AND service_id = ?"
		args = append(args, serviceID)
	}

	query += " ORDER BY start_time DESC LIMIT ?"
	args = append(args, limit*20)

	rows, err := qs.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("trace query failed: %w", err)
	}
	defer rows.Close()

	byTrace := map[string]*TraceResult{}
	var order []string
	for rows.Next() {
		var traceIDv, spanID, parentSpanID, serviceIDv, operationName string
		var startTime, endTime time.Time
		var tags map[string]string
		if err := rows.Scan(&traceIDv, &spanID, &parentSpanID, &serviceIDv, &operationName, &startTime, &endTime, &tags); err != nil {
			return nil, fmt.Errorf("trace scan failed: %w", err)
		}

		tr, exists := byTrace[traceIDv]
		if !exists {
			tr = &TraceResult{TraceID: traceIDv, StartTime: startTime}
			byTrace[traceIDv] = tr
			order = append(order, traceIDv)
		}
		if startTime.Before(tr.StartTime) {
			tr.StartTime = startTime
		}
		duration := endTime.Sub(startTime).Seconds() * 1000
		status := "OK"
		if strings.EqualFold(statusOfTags(tags), "error") {
			status = "ERROR"
		}
		tr.Spans = append(tr.Spans, SpanResult{
			SpanID:        spanID,
			ParentSpanID:  parentSpanID,
			OperationName: operationName,
			Service:       serviceIDv,
			StartTime:     startTime,
			Duration:      duration,
			Status:        status,
			Tags:          tags,
		})
	}

	var results []TraceResult
	for _, id := range order {
		tr := byTrace[id]
		maxEnd := tr.StartTime
		for _, s := range tr.Spans {
			if s.StartTime.Add(time.Duration(s.Duration*float64(time.Millisecond))).After(maxEnd) {
				maxEnd = s.StartTime.Add(time.Duration(s.Duration * float64(time.Millisecond)))
			}
		}
		tr.Duration = maxEnd.Sub(tr.StartTime).Seconds() * 1000
		tr.SpanCount = len(tr.Spans)
		svcSet := map[string]bool{}
		for _, s := range tr.Spans {
			svcSet[s.Service] = true
		}
		tr.ServiceCount = len(svcSet)
		results = append(results, *tr)
	}

	return results, nil
}

// ── Service catalog (audit V2: catalog endpoints were hardcoded stubs) ─────
// The catalog now reflects what the collector actually ingests: distinct
// service_ids observed across metrics/logs/traces, with a health score derived
// from recent error-level log ratio. No fabricated services.

// ListServices returns the distinct service_ids seen in telemetry, optionally
// tenant-scoped. Empty when nothing has been ingested yet.
func (qs *QueryService) ListServices(ctx context.Context, tenantID string) ([]string, error) {
	query := `SELECT DISTINCT service_id FROM (
		SELECT service_id FROM metrics
		UNION ALL
		SELECT service_id FROM logs
		UNION ALL
		SELECT service_id FROM traces
	)`
	args := []interface{}{}
	if tenantID != "" {
		query = `SELECT DISTINCT service_id FROM (
			SELECT service_id FROM metrics WHERE tenant_id = ?
			UNION ALL
			SELECT service_id FROM logs WHERE tenant_id = ?
			UNION ALL
			SELECT service_id FROM traces WHERE tenant_id = ?
		)`
		args = []interface{}{tenantID, tenantID, tenantID}
	}

	rows, err := qs.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list services failed: %w", err)
	}
	defer rows.Close()

	seen := map[string]bool{}
	var services []string
	for rows.Next() {
		var service string
		if err := rows.Scan(&service); err != nil {
			return nil, fmt.Errorf("list services scan failed: %w", err)
		}
		if service != "" && !seen[service] {
			seen[service] = true
			services = append(services, service)
		}
	}
	return services, nil
}

// ServiceDependency is one edge of the service graph: the service the queried
// service CALLS (outbound dependency). Type is a best-effort classification
// derived from the callee id (database / cache / queue / service).
type ServiceDependency struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
}

// dependencyType classifies a callee from its id. Kept deliberately simple —
// it is a display hint, not a source of truth.
func dependencyType(id string) string {
	lower := strings.ToLower(id)
	switch {
	case strings.Contains(lower, "postgres"), strings.Contains(lower, "mysql"), strings.Contains(lower, "db"):
		return "database"
	case strings.Contains(lower, "redis"), strings.Contains(lower, "cache"):
		return "cache"
	case strings.Contains(lower, "kafka"), strings.Contains(lower, "rabbit"), strings.Contains(lower, "queue"):
		return "queue"
	default:
		return "service"
	}
}

// ListDependencies returns the services that serviceID calls, derived from the
// real trace parent/child span links (span A of service X being the parent of
// span B of service Y means X depends on Y). Honest empty list when no trace
// data exists — never fabricated edges.
func (qs *QueryService) ListDependencies(ctx context.Context, tenantID, serviceID string) ([]ServiceDependency, error) {
	query := `SELECT DISTINCT t2.service_id
		FROM traces t1
		JOIN traces t2 ON t1.span_id = t2.parent_span_id
		  AND t1.tenant_id = t2.tenant_id
		WHERE t1.service_id = ?
		  AND t2.service_id != t1.service_id`
	args := []interface{}{serviceID}
	if tenantID != "" {
		query += " AND t1.tenant_id = ?"
		args = append(args, tenantID)
	}
	query += " LIMIT 50"

	rows, err := qs.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("dependencies query failed: %w", err)
	}
	defer rows.Close()

	seen := map[string]bool{}
	var deps []ServiceDependency
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("dependencies scan failed: %w", err)
		}
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		deps = append(deps, ServiceDependency{
			ID:   id,
			Name: id,
			Type: dependencyType(id),
		})
	}
	return deps, nil
}

// ServiceHealth computes a 0-100 health score for a service from the error-level
// log ratio in the window. Returns 100 when there is no log data (no evidence of
// errors — not a fabricated number).
func (qs *QueryService) ServiceHealth(ctx context.Context, tenantID, serviceID string, window time.Duration) (float64, error) {
	query := `SELECT countIf(level IN ('error','critical','fatal')), count() FROM logs
		WHERE service_id = ? AND ts >= ? AND ts <= ?`
	args := []interface{}{serviceID, time.Now().UTC().Add(-window), time.Now().UTC()}
	if tenantID != "" {
		query += " AND tenant_id = ?"
		args = append(args, tenantID)
	}

	var errCount, total uint64
	if err := qs.conn.QueryRow(ctx, query, args...).Scan(&errCount, &total); err != nil {
		return 0, fmt.Errorf("service health query failed: %w", err)
	}
	if total == 0 {
		return 100, nil
	}
	score := 100.0 - (float64(errCount)/float64(total))*100.0
	if score < 0 {
		score = 0
	}
	return score, nil
}

func statusOfTags(tags map[string]string) string {
	if tags == nil {
		return ""
	}
	if s, ok := tags["status"]; ok {
		return s
	}
	if s, ok := tags["otel.status_code"]; ok {
		return s
	}
	return ""
}

