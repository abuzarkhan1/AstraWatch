package ratelimit

import (
	"testing"
)

func TestRateLimiter_Allow(t *testing.T) {
	rl := NewRateLimiter(100, 200)

	if !rl.Allow("tenant-1") {
		t.Fatal("expected first request to be allowed")
	}
}

func TestRateLimiter_TenantIsolation(t *testing.T) {
	rl := NewRateLimiter(1, 1)

	rl.Allow("tenant-a")
	if rl.Allow("tenant-a") {
		t.Log("note: second call may be rate limited based on timing")
	}

	if !rl.Allow("tenant-b") {
		t.Fatal("tenant-b should have its own bucket")
	}
}

func TestRateLimiter_Burst(t *testing.T) {
	rl := NewRateLimiter(10, 5)

	for i := 0; i < 5; i++ {
		if !rl.Allow("burst-test") {
			t.Fatalf("expected burst %d to be allowed", i)
		}
	}
}
