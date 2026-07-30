package validate

import (
	"testing"
	"time"

	"github.com/astrawatch/collector/pkg"
)

func TestValidator_ValidateBatch_Valid(t *testing.T) {
	v := NewValidator()
	batch := pkg.MetricBatch{
		ServiceID: "payment-v2",
		Metrics: []pkg.MetricPoint{
			{Name: "latency_p95", Value: 250.0, Timestamp: time.Now()},
			{Name: "error_rate", Value: 0.5, Timestamp: time.Now()},
		},
	}

	valid, rejected := v.ValidateBatch(batch)
	if len(rejected) > 0 {
		t.Fatalf("expected no rejections, got %d: %v", len(rejected), rejected)
	}
	if len(valid.Metrics) != 2 {
		t.Fatalf("expected 2 valid metrics, got %d", len(valid.Metrics))
	}
}

func TestValidator_ValidateBatch_MissingServiceID(t *testing.T) {
	v := NewValidator()
	batch := pkg.MetricBatch{
		Metrics: []pkg.MetricPoint{
			{Name: "latency", Value: 100, Timestamp: time.Now()},
		},
	}

	valid, rejected := v.ValidateBatch(batch)
	if len(valid.Metrics) > 0 {
		t.Fatal("expected 0 valid metrics when service ID is missing")
	}
	if len(rejected) == 0 {
		t.Fatal("expected rejections when service ID is missing")
	}
}

func TestValidator_ValidateBatch_EmptyMetrics(t *testing.T) {
	v := NewValidator()
	batch := pkg.MetricBatch{
		ServiceID: "test-svc",
		Metrics:   []pkg.MetricPoint{},
	}

	valid, rejected := v.ValidateBatch(batch)
	if len(valid.Metrics) != 0 {
		t.Fatal("expected 0 valid metrics")
	}
	if len(rejected) != 0 {
		t.Fatal("expected 0 rejections")
	}
}

func TestValidator_ValidateBatch_FutureTimestamp(t *testing.T) {
	v := NewValidator()
	batch := pkg.MetricBatch{
		ServiceID: "test-svc",
		Metrics: []pkg.MetricPoint{
			{Name: "cpu", Value: 50, Timestamp: time.Now().Add(48 * time.Hour)},
		},
	}

	valid, rejected := v.ValidateBatch(batch)
	if len(valid.Metrics) != 0 {
		t.Fatal("expected 0 valid metrics for future timestamps")
	}
	if len(rejected) != 1 {
		t.Fatalf("expected 1 rejection, got %d", len(rejected))
	}
}
