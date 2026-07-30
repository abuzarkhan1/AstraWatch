package ratelimit

import (
	"sync"

	"golang.org/x/time/rate"
)

type RateLimiter struct {
	mu       sync.RWMutex
	limiters map[string]*rate.Limiter
	rps      rate.Limit
	burst    int
}

func NewRateLimiter(rps int, burst int) *RateLimiter {
	return &RateLimiter{
		limiters: make(map[string]*rate.Limiter),
		rps:      rate.Limit(rps),
		burst:    burst,
	}
}

func (rl *RateLimiter) Allow(tenantID string) bool {
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
