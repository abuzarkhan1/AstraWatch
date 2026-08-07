package main

import (
	"context"
	"testing"

	"github.com/gin-gonic/gin"
)

// usageMeter is nil-safe and must never fail ingestion or the usage endpoints
// when Redis is unavailable (audit P4.15: metering is best-effort).

func TestUsageMeter_NilCurrent(t *testing.T) {
	var m *usageMeter
	out := m.Current(context.Background(), "tenant-a")
	if out["metrics"] != 0 || out["logs"] != 0 || out["traces"] != 0 {
		t.Errorf("expected zero counters for nil meter, got %v", out)
	}
	if out["date"] == "" || out["tenantId"] != "tenant-a" {
		t.Errorf("expected date + tenantId, got %v", out)
	}
}

func TestUsageMeter_NilHistory(t *testing.T) {
	var m *usageMeter
	out := m.History(context.Background(), "tenant-a", 30)
	days, ok := out["days"].([]gin.H)
	if !ok || len(days) != 0 {
		t.Errorf("expected empty days for nil meter, got %v", out)
	}
}

func TestUsageMeter_NilAdd(t *testing.T) {
	var m *usageMeter
	// Must not panic.
	m.Add(context.Background(), "tenant-a", "metrics", 100)
}

func TestUsageMeter_KeyFormat(t *testing.T) {
	// With a nil meter the key() helper still produces the per-day key shape
	// that /v1/usage/history reads back: usage:{tenant}:{YYYYMMDD}:{kind}.
	m := &usageMeter{}
	k := m.keyFor("tenant-a", "20260101", "logs")
	if k != "usage:tenant-a:20260101:logs" {
		t.Errorf("unexpected key %q", k)
	}
}
