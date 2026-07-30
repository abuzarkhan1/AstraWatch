package query

import (
	"context"
	"fmt"
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
	query := `SELECT ts, value FROM metrics
		WHERE service_id = ?
		AND metric_name = ?
		AND ts >= ?
		AND ts <= ?
		ORDER BY ts ASC`

	rows, err := qs.conn.Query(ctx, query, serviceID, metric, from, to)
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

func (qs *QueryService) QueryAggregated(ctx context.Context, serviceID, metric string, from, to time.Time, aggregation string) (float64, error) {
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

	var result float64
	if err := qs.conn.QueryRow(ctx, query, serviceID, metric, from, to).Scan(&result); err != nil {
		return 0, fmt.Errorf("aggregation query failed: %w", err)
	}

	return result, nil
}

func (qs *QueryService) QueryMetricsWithStep(ctx context.Context, serviceID, metric string, from, to time.Time, step time.Duration) (*pkg.QueryResult, error) {
	query := `SELECT toStartOfInterval(ts, INTERVAL ? SECOND) AS bucket, avg(value) AS val
		FROM metrics
		WHERE service_id = ? AND metric_name = ? AND ts >= ? AND ts <= ?
		GROUP BY bucket ORDER BY bucket ASC`

	stepSec := int(step.Seconds())
	rows, err := qs.conn.Query(ctx, query, stepSec, serviceID, metric, from, to)
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
