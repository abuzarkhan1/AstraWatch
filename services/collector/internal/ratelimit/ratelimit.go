package ratelimit

import (
	"context"
	"strconv"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"golang.org/x/time/rate"
)

// RateLimiter enforces per-tenant ingest limits. When a Redis client is
// configured it uses a distributed fixed-window counter (shared across every
// collector replica — audit P4: the old limiter was in-memory only, so N
// replicas each allowed N× the intended throughput). When Redis is unavailable
// it falls back to an in-memory token bucket so the collector still starts and
// rate-limits locally instead of failing open.
// scriptRunner is the minimal Redis surface the limiter needs (Eval + EvalSha).
// Using this narrow interface keeps the limiter testable without a live Redis
// and avoids depending on the full redis.Scripter contract.
type scriptRunner interface {
	Eval(ctx context.Context, script string, keys []string, args ...interface{}) *redis.Cmd
}

type RateLimiter struct {
	rdb    scriptRunner
	keyTTL time.Duration
	max    int64
	window time.Duration

	// In-memory fallback (token bucket per tenant).
	mu       sync.RWMutex
	limiters map[string]*rate.Limiter
	rps      rate.Limit
	burst    int
}

// NewRateLimiter builds an in-memory token-bucket limiter (legacy behavior).
func NewRateLimiter(rps int, burst int) *RateLimiter {
	return &RateLimiter{
		limiters: make(map[string]*rate.Limiter),
		rps:      rate.Limit(rps),
		burst:    burst,
	}
}

// NewRedisRateLimiter builds a distributed fixed-window limiter backed by Redis.
// maxRequests are allowed per window per tenant; on Redis failure each Allow
// call degrades to the in-memory token bucket (rps/burst) instead of failing.
func NewRedisRateLimiter(rdb scriptRunner, maxRequests int, window time.Duration, rps int, burst int) *RateLimiter {
	return &RateLimiter{
		rdb:      rdb,
		max:      int64(maxRequests),
		window:   window,
		keyTTL:   window,
		limiters: make(map[string]*rate.Limiter),
		rps:      rate.Limit(rps),
		burst:    burst,
	}
}

// Allow reports whether a request from the tenant is within the rate limit.
func (rl *RateLimiter) Allow(tenantID string) bool {
	if rl == nil {
		return true
	}
	if rl.rdb != nil {
		ok, err := rl.redisAllow(tenantID)
		if err == nil {
			return ok
		}
		// Redis unreachable → local token bucket (bounded degradation).
	}
	return rl.memoryAllow(tenantID)
}

// redisAllow uses INCR + EXPIRE to count requests per fixed window. Atomic via
// a single Lua script so concurrent replicas cannot over-allow.
func (rl *RateLimiter) redisAllow(tenantID string) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	now := time.Now().Unix()
	windowSec := int64(rl.window.Seconds())
	if windowSec < 1 {
		windowSec = 1
	}
	bucket := now / windowSec
	key := "ratelimit:" + tenantID + ":" + strconv.FormatInt(bucket, 10)

	script := `
local c = redis.call('INCR', KEYS[1])
if c == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return c
`

	count, err := rl.rdb.Eval(ctx, script, []string{key}, rl.keyTTL.Milliseconds()).Int64()
	if err != nil {
		return false, err
	}
	return count <= rl.max, nil
}

func (rl *RateLimiter) memoryAllow(tenantID string) bool {
	rl.mu.RLock()
	limiter, exists := rl.limiters[tenantID]
	rl.mu.RUnlock()

	if !exists {
		limiter = rate.NewLimiter(rl.rps, rl.burst)
		rl.mu.Lock()
		rl.limiters[tenantID] = limiter
		rl.mu.Unlock()
	}

	return limiter.Allow()
}

// RedisHealthy reports whether the distributed store is reachable.
func (rl *RateLimiter) RedisHealthy() bool {
	if rl == nil || rl.rdb == nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	return rl.rdb.Eval(ctx, "return 1", nil).Err() == nil
}
