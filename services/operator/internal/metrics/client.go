package metrics

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type MetricValue struct {
	Value     float64
	Timestamp time.Time
}

type MetricsClient interface {
	Query(ctx context.Context, metric string, service string) (*MetricValue, error)
}

type HTTPMetricsClient struct {
	BaseURL string
	Client  *http.Client
}

func NewHTTPMetricsClient(baseURL string) *HTTPMetricsClient {
	if baseURL == "" {
		baseURL = "http://collector:8080"
	}
	return &HTTPMetricsClient{
		BaseURL: baseURL,
		Client: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

func (c *HTTPMetricsClient) Query(ctx context.Context, metric string, service string) (*MetricValue, error) {
	url := fmt.Sprintf("%s/api/v1/metrics/query?metric=%s&service=%s&window=1m", c.BaseURL, metric, service)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to query metrics: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Parse simple JSON response: {"value": 12.5, "timestamp": "..."}
	var result struct {
		Value     float64 `json:"value"`
		Timestamp string  `json:"timestamp"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse metrics response: %w", err)
	}

	ts, _ := time.Parse(time.RFC3339, result.Timestamp)

	return &MetricValue{
		Value:     result.Value,
		Timestamp: ts,
	}, nil
}

// EvaluateCondition checks if a metric value meets a threshold condition.
func EvaluateCondition(value float64, operator string, threshold float64) bool {
	switch operator {
	case ">":
		return value > threshold
	case "<":
		return value < threshold
	case ">=":
		return value >= threshold
	case "<=":
		return value <= threshold
	case "==":
		return value == threshold
	case "!=":
		return value != threshold
	default:
		return false
	}
}
