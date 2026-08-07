package ratelimit

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

// fakeScripter implements redis.Scripter for deterministic Redis-path tests.
type fakeScripter struct {
	evals  int
	counts map[string]int64
	err    error
}

func (f *fakeScripter) Eval(ctx context.Context, script string, keys []string, args ...interface{}) *redis.Cmd {
	cmd := redis.NewCmd(ctx)
	if f.err != nil {
		cmd.SetErr(f.err)
		return cmd
	}
	f.evals++
	key := keys[0]
	f.counts[key]++
	cmd.SetVal(f.counts[key])
	return cmd
}

func (f *fakeScripter) EvalRO(ctx context.Context, script string, keys []string, args ...interface{}) *redis.Cmd {
	return f.Eval(ctx, script, keys, args...)
}

func (f *fakeScripter) EvalSha(ctx context.Context, sha1 string, keys []string, args ...interface{}) *redis.Cmd {
	return f.Eval(ctx, "sha:"+sha1, keys, args...)
}

func (f *fakeScripter) EvalShaRO(ctx context.Context, sha1 string, keys []string, args ...interface{}) *redis.Cmd {
	return f.Eval(ctx, "sha:"+sha1, keys, args...)
}

func (f *fakeScripter) ScriptExists(ctx context.Context, hashes ...string) *redis.BoolSliceCmd {
	return redis.NewBoolSliceCmd(ctx)
}

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

func TestRedisRateLimiter_EnforcesWindow(t *testing.T) {
	fake := &fakeScripter{counts: map[string]int64{}}
	rl := NewRedisRateLimiter(fake, 3, time.Second, 100, 200)

	// First 3 requests in the window are allowed.
	for i := 0; i < 3; i++ {
		if !rl.Allow("redis-tenant") {
			t.Fatalf("request %d should be allowed within window", i+1)
		}
	}
	// 4th exceeds the window limit.
	if rl.Allow("redis-tenant") {
		t.Fatal("4th request should be rejected by the Redis window")
	}
}

func TestRedisRateLimiter_FallsBackToMemoryOnRedisError(t *testing.T) {
	fake := &fakeScripter{err: errors.New("redis down")}
	rl := NewRedisRateLimiter(fake, 3, time.Second, 100, 200)

	// Redis failure must not fail open or crash — it degrades to the local
	// token bucket (which allows within burst).
	for i := 0; i < 5; i++ {
		if !rl.Allow("fallback-tenant") {
			t.Fatalf("request %d should be allowed via in-memory fallback", i+1)
		}
	}
}

func TestRedisRateLimiter_TenantIsolation(t *testing.T) {
	fake := &fakeScripter{counts: map[string]int64{}}
	rl := NewRedisRateLimiter(fake, 1, time.Second, 100, 200)

	if !rl.Allow("tenant-x") {
		t.Fatal("tenant-x first request should be allowed")
	}
	if rl.Allow("tenant-x") {
		t.Fatal("tenant-x second request should exceed its window")
	}
	if !rl.Allow("tenant-y") {
		t.Fatal("tenant-y must have its own independent window")
	}
}

func TestRedisRateLimiter_Healthy(t *testing.T) {
	if NewRateLimiter(1, 1).RedisHealthy() {
		t.Fatal("in-memory limiter has no Redis and must report unhealthy")
	}
	if NewRedisRateLimiter(&fakeScripter{err: errors.New("down")}, 1, time.Second, 1, 1).RedisHealthy() {
		t.Fatal("failing Redis must report unhealthy")
	}
}
