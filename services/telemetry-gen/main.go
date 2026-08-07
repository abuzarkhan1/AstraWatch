// AstraWatch Telemetry Generator.
//
// Produces realistic metrics / logs / traces for a small demo microservice
// estate and pushes them into the collector's ingest endpoints. This is the
// out-of-the-box data source for the product: without it, every chart on the
// Dashboard, Topology, Logs, Traces, SLO and Status pages renders an honest
// empty state because nothing in the stack emits telemetry (the real eBPF
// cxx-agent requires root + a 5.8+ kernel).
//
// What it generates (all REAL data flowing through the real pipeline):
//   - Metrics  -> POST /v1/ingest/metrics/batch  (JSON batch, gzip)
//   - Logs     -> POST /v1/ingest/logs/stream    (NDJSON, gzip)
//   - Traces   -> POST /v1/ingest/traces         (OTLP/JSON, gzip)
//
// The ingest endpoints are in the collector's agent bypass list and the tenant
// is carried via the X-Tenant-Id header (same contract the OTel paths use), so
// no JWT is required. The collector routes everything through its real
// producer -> Kafka -> ClickHouse consumer pipeline.
//
// A built-in anomaly engine makes one or two services "break" every few
// minutes (latency/error spikes, ERROR spans, error-log bursts) so the SLO,
// topology health and incident flows have something real to react to.
//
// Environment:
//   COLLECTOR_URL        collector base URL        (default http://localhost:8080)
//   TENANT               tenant id for the writes  (default "default")
//   TICK_SECONDS         live data cadence         (default 5)
//   BACKFILL_MINUTES     minutes of history seeded on start, capped at 60
//                        (default 45; set 0 to disable)
//   ANOMALIES            enable the fault engine   (default "1")
package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// ── Wire formats (must match the collector's pkg structs) ────────────────

type metricPoint struct {
	Timestamp time.Time         `json:"ts"`
	Name      string            `json:"name"`
	Value     float64           `json:"value"`
	Labels    map[string]string `json:"labels"`
}

type metricBatch struct {
	BatchID    string        `json:"batchId,omitempty"`
	TenantID   string        `json:"tenantId,omitempty"`
	ServiceID  string        `json:"serviceId"`
	Cluster    string        `json:"cluster"`
	Namespace  string        `json:"namespace"`
	Metrics    []metricPoint `json:"metrics"`
	Source     string        `json:"source"`
	ReceivedAt time.Time     `json:"receivedAt"`
}

type logEntry struct {
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

// OTLP/JSON trace payload — the collector parses traces with pkg.ParseOTLP.
type otlpTrace struct {
	ResourceSpans []resourceSpan `json:"resourceSpans"`
}
type resourceSpan struct {
	Resource   resource     `json:"resource"`
	ScopeSpans []scopeSpans `json:"scopeSpans"`
}
type resource struct {
	Attributes map[string]any `json:"attributes"`
}
type scopeSpans struct {
	Spans []otlpSpan `json:"spans"`
}
type otlpSpan struct {
	TraceID      string            `json:"traceId"`
	SpanID       string            `json:"spanId"`
	ParentSpanID string            `json:"parentSpanId"`
	Name         string            `json:"name"`
	StartTime    time.Time         `json:"startTime"`
	EndTime      time.Time         `json:"endTime"`
	Status       otlpSpanStatus    `json:"status"`
	Attributes   map[string]string `json:"attributes"`
}
type otlpSpanStatus struct {
	Code string `json:"code"`
}

// ── Service model ────────────────────────────────────────────────────────

type serviceModel struct {
	ID           string
	Kind         string // "app" | "worker" | "infra"
	baseLatency  float64
	latencyAmp   float64
	phase        float64
	period       float64
	baseErrRate  float64
	baseRPS      float64
	rpsAmp       float64
	cpuBase      float64
	memBase      float64
	infoLogs     []string
	debugLogs    []string
	warnLogs     []string
	errorLogs    []string
	operations   []string // span operation names
	routes       []string // http routes for trace tags
}

func services() []*serviceModel {
	return []*serviceModel{
		{
			ID: "api-gateway", Kind: "app",
			baseLatency: 12, latencyAmp: 6, phase: 0.4, period: 240, baseErrRate: 0.005, baseRPS: 180, rpsAmp: 40, cpuBase: 32, memBase: 58,
			infoLogs:  []string{"request handled", "route matched", "auth token verified", "response compressed"},
			debugLogs: []string{"upstream chosen: %d", "cache lookup miss", "connection pooled"},
			warnLogs:  []string{"slow upstream response: %dms", "retrying upstream", "rate limit approaching for client"},
			errorLogs: []string{"upstream connection refused", "timeout waiting for upstream", "5xx returned to client", "upstream unavailable"},
			operations: []string{"GET /api/v1/orders", "GET /api/v1/products", "POST /api/v1/checkout", "GET /api/v1/search", "POST /api/v1/auth/login"},
			routes:     []string{"/api/v1/orders", "/api/v1/products", "/api/v1/checkout", "/api/v1/search", "/api/v1/auth/login"},
		},
		{
			ID: "auth-service", Kind: "app",
			baseLatency: 8, latencyAmp: 4, phase: 2.1, period: 180, baseErrRate: 0.002, baseRPS: 95, rpsAmp: 25, cpuBase: 18, memBase: 42,
			infoLogs:  []string{"token issued", "session created", "password hash verified", "refresh token rotated"},
			debugLogs: []string{"cache hit for session", "jwk fetched", "lock acquired"},
			warnLogs:  []string{"brute-force attempt blocked", "token nearing expiry", "rate limited login"},
			errorLogs: []string{"invalid credentials", "token verification failed", "session store unavailable", "jwk refresh failed"},
			operations: []string{"POST /v1/auth/login", "POST /v1/auth/refresh", "GET /v1/auth/me"},
			routes:     []string{"/v1/auth/login", "/v1/auth/refresh", "/v1/auth/me"},
		},
		{
			ID: "payment-api", Kind: "app",
			baseLatency: 45, latencyAmp: 22, phase: 5.3, period: 300, baseErrRate: 0.01, baseRPS: 40, rpsAmp: 12, cpuBase: 24, memBase: 51,
			infoLogs:  []string{"charge authorized", "payment captured", "refund processed", "webhook received"},
			debugLogs: []string{"stripe idempotency reuse", "provider latency %dms", "retry budget ok"},
			warnLogs:  []string{"payment declined by issuer", "webhook signature retry", "provider slow: %dms"},
			errorLogs: []string{"payment provider timeout", "charge failed", "webhook verification failed", "provider 5xx"},
			operations: []string{"POST /v1/charges", "POST /v1/refunds", "GET /v1/charges/{id}"},
			routes:     []string{"/v1/charges", "/v1/refunds", "/v1/charges/{id}"},
		},
		{
			ID: "order-service", Kind: "app",
			baseLatency: 28, latencyAmp: 12, phase: 1.2, period: 260, baseErrRate: 0.008, baseRPS: 65, rpsAmp: 18, cpuBase: 27, memBase: 55,
			infoLogs:  []string{"order created", "order status updated", "stock reserved", "order shipped"},
			debugLogs: []string{"inventory check cache miss", "queue publish ok", "order total computed"},
			warnLogs:  []string{"stock low for sku %d", "inventory slow", "order validation warning"},
			errorLogs: []string{"inventory unavailable", "order persist failed", "stock reservation failed", "dead-lettered message"},
			operations: []string{"POST /v1/orders", "PUT /v1/orders/{id}", "GET /v1/orders/{id}"},
			routes:     []string{"/v1/orders", "/v1/orders/{id}"},
		},
		{
			ID: "inventory-service", Kind: "app",
			baseLatency: 15, latencyAmp: 7, phase: 3.4, period: 200, baseErrRate: 0.004, baseRPS: 50, rpsAmp: 15, cpuBase: 21, memBase: 47,
			infoLogs:  []string{"stock checked", "stock decremented", "reorder triggered", "sku updated"},
			debugLogs: []string{"warehouse lookup", "reservation lock held"},
			warnLogs:  []string{"sku %d below reorder point", "warehouse latency high"},
			errorLogs: []string{"warehouse api timeout", "reservation conflict", "reorder failed"},
			operations: []string{"GET /v1/stock", "POST /v1/stock/reserve", "PUT /v1/stock"},
			routes:     []string{"/v1/stock", "/v1/stock/reserve"},
		},
		{
			ID: "search-service", Kind: "app",
			baseLatency: 35, latencyAmp: 15, phase: 4.1, period: 220, baseErrRate: 0.006, baseRPS: 85, rpsAmp: 30, cpuBase: 29, memBase: 63,
			infoLogs:  []string{"search executed", "index refreshed", "query autocompleted"},
			debugLogs: []string{"index shard hit", "relevance re-ranked"},
			warnLogs:  []string{"index lag %ds", "query parse warning"},
			errorLogs: []string{"index unavailable", "query failed", "index refresh failure"},
			operations: []string{"GET /v1/search", "POST /v1/search/reindex"},
			routes:     []string{"/v1/search"},
		},
		{
			ID: "notification-service", Kind: "app",
			baseLatency: 10, latencyAmp: 5, phase: 0.9, period: 150, baseErrRate: 0.003, baseRPS: 30, rpsAmp: 8, cpuBase: 15, memBase: 39,
			infoLogs:  []string{"email queued", "push sent", "sms dispatched", "digest prepared"},
			debugLogs: []string{"template rendered", "bounce list checked"},
			warnLogs:  []string{"email provider slow", "push token stale"},
			errorLogs: []string{"email provider rejected", "webhook delivery failed", "template render failed"},
			operations: []string{"POST /v1/notify", "POST /v1/digests"},
			routes:     []string{"/v1/notify"},
		},
		{
			ID: "checkout-worker", Kind: "worker",
			baseLatency: 55, latencyAmp: 25, phase: 6.2, period: 320, baseErrRate: 0.012, baseRPS: 22, rpsAmp: 6, cpuBase: 35, memBase: 60,
			infoLogs:  []string{"checkout finalized", "payment confirmed async", "order fulfilled", "message processed"},
			debugLogs: []string{"partition lag %d", "batch drained"},
			warnLogs:  []string{"retry %d for message", "consumer lag growing"},
			errorLogs: []string{"checkout step failed", "poison message", "retry budget exhausted"},
			operations: []string{"process checkout", "process refund"},
			routes:     []string{},
		},
		// Infra "services" appear as spans (call targets) so the topology graph
		// has real nodes beyond the app estate — same shape a real trace shows.
		{
			ID: "postgres-primary", Kind: "infra",
			baseLatency: 4, latencyAmp: 2, phase: 2.8, period: 190, baseErrRate: 0.001, baseRPS: 0, rpsAmp: 0, cpuBase: 45, memBase: 78,
			operations: []string{"SELECT", "INSERT", "UPDATE", "BEGIN"},
			routes:     []string{},
		},
		{
			ID: "redis-cache", Kind: "infra",
			baseLatency: 1.5, latencyAmp: 1, phase: 5.8, period: 140, baseErrRate: 0.0005, baseRPS: 0, rpsAmp: 0, cpuBase: 12, memBase: 30,
			operations: []string{"GET", "SET", "INCR", "EXPIRE"},
			routes:     []string{},
		},
	}
}

// Downstream call graph used to synthesize spans: caller -> possible callees.
// Weighted choices make the graph stable but non-trivial.
var callGraph = map[string][][2]any{ // [2]any = {service, weight}
	"api-gateway":       {{"auth-service", 0.30}, {"payment-api", 0.35}, {"order-service", 0.25}, {"search-service", 0.10}},
	"auth-service":      {{"redis-cache", 0.60}, {"postgres-primary", 0.40}},
	"payment-api":       {{"postgres-primary", 0.55}, {"redis-cache", 0.45}},
	"order-service":     {{"inventory-service", 0.40}, {"postgres-primary", 0.35}, {"redis-cache", 0.25}},
	"inventory-service": {{"postgres-primary", 0.80}, {"redis-cache", 0.20}},
	"search-service":    {{"postgres-primary", 0.70}, {"redis-cache", 0.30}},
	"notification-service": {{"redis-cache", 0.75}, {"postgres-primary", 0.25}},
	"checkout-worker":   {{"postgres-primary", 0.70}, {"redis-cache", 0.30}},
}

// ── Engine ───────────────────────────────────────────────────────────────

type config struct {
	collectorURL  string
	tenant        string
	tick          time.Duration
	backfillMin   int
	anomalies     bool
}

type engine struct {
	cfg       config
	client    *http.Client
	services  []*serviceModel
	byID      map[string]*serviceModel

	mu          sync.Mutex
	anomalyEnds map[string]time.Time // service -> when its fault episode ends
	nextPick    time.Time
}

func newEngine(cfg config) *engine {
	e := &engine{
		cfg:         cfg,
		client:      &http.Client{Timeout: 15 * time.Second},
		services:    services(),
		byID:        map[string]*serviceModel{},
		anomalyEnds: map[string]time.Time{},
	}
	for _, s := range e.services {
		e.byID[s.ID] = s
	}
	e.nextPick = time.Now().Add(60 * time.Second)
	return e
}

// inAnomaly reports whether svc is mid-fault-episode.
func (e *engine) inAnomaly(id string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	end, ok := e.anomalyEnds[id]
	return ok && time.Now().Before(end)
}

// scheduler picks a service to break every few minutes; the episode lasts
// 60–150s, then the service recovers on its own.
func (e *engine) scheduler(ctx context.Context) {
	t := time.NewTicker(5 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if !e.cfg.anomalies {
				continue
			}
			e.mu.Lock()
			now := time.Now()
			// prune expired episodes
			for id, end := range e.anomalyEnds {
				if !now.Before(end) {
					delete(e.anomalyEnds, id)
				}
			}
			if now.After(e.nextPick) {
				// prefer app services; skip infra
				var apps []*serviceModel
				for _, s := range e.services {
					if s.Kind == "app" || s.Kind == "worker" {
						apps = append(apps, s)
					}
				}
				idx := rand.Intn(len(apps))
				svc := apps[idx]
				if _, active := e.anomalyEnds[svc.ID]; !active {
					e.anomalyEnds[svc.ID] = now.Add(time.Duration(60+rand.Intn(90)) * time.Second)
					log.Printf("anomaly started: %s", svc.ID)
				}
				e.nextPick = now.Add(time.Duration(150+rand.Intn(150)) * time.Second)
			}
			e.mu.Unlock()
		}
	}
}

// ── Value models (sine + noise + anomaly boost) ─────────────────────────

func (e *engine) latency(s *serviceModel, t time.Time) float64 {
	sec := float64(t.Unix())
	v := s.baseLatency + s.latencyAmp*math.Sin(2*math.Pi*sec/s.period+s.phase)
	if v < 1 {
		v = 1
	}
	if e.inAnomaly(s.ID) {
		v *= 3 + 5*rand.Float64() // 3x–8x
	}
	return v + v*0.12*rand.NormFloat64()
}

func (e *engine) errorRate(s *serviceModel, t time.Time) float64 {
	v := s.baseErrRate + 0.003*rand.NormFloat64()
	if v < 0 {
		v = 0
	}
	if e.inAnomaly(s.ID) {
		v = 0.12 + 0.25*rand.Float64()
	}
	if v > 0.99 {
		v = 0.99
	}
	return v
}

func (e *engine) rps(s *serviceModel, t time.Time) float64 {
	sec := float64(t.Unix())
	v := s.baseRPS + s.rpsAmp*math.Sin(2*math.Pi*sec/(s.period*2)+s.phase)
	if v < 1 {
		v = 1
	}
	if e.inAnomaly(s.ID) {
		v *= 0.7 + 0.3*rand.Float64() // traffic shifts during incidents
	}
	return v
}

func (e *engine) cpu(s *serviceModel, t time.Time) float64 {
	v := s.cpuBase + 8*math.Sin(2*math.Pi*float64(t.Unix())/300+s.phase) + 3*rand.NormFloat64()
	if e.inAnomaly(s.ID) {
		v += 20 + 15*rand.Float64()
	}
	if v < 2 {
		v = 2
	}
	return v
}

func (e *engine) mem(s *serviceModel, t time.Time) float64 {
	v := s.memBase + 4*rand.NormFloat64()
	if e.inAnomaly(s.ID) {
		v += 10
	}
	if v < 5 {
		v = 5
	}
	if v > 98 {
		v = 98
	}
	return v
}

// ── Emission helpers ────────────────────────────────────────────────────

func (e *engine) emitMetrics(at time.Time) {
	var wg sync.WaitGroup
	for _, s := range e.services {
		if s.Kind == "infra" {
			continue // infra nodes carry spans only
		}
		wg.Add(1)
		go func(s *serviceModel) {
			defer wg.Done()
			ts := at
			points := []metricPoint{
				{ts, "latency", math.Round(e.latency(s, ts)*100) / 100, map[string]string{"unit": "ms"}},
				{ts, "error_rate", math.Round(e.errorRate(s, ts)*10000) / 100, map[string]string{"unit": "percent"}},
				{ts, "request_rate", math.Round(e.rps(s, ts)*100) / 100, map[string]string{"unit": "rps"}},
				{ts, "cpu_usage", math.Round(e.cpu(s, ts)*100) / 100, map[string]string{"unit": "percent"}},
				{ts, "memory_usage", math.Round(e.mem(s, ts)*100) / 100, map[string]string{"unit": "percent"}},
			}
			if s.Kind == "worker" {
				q := 2 + rand.Intn(12)
				if e.inAnomaly(s.ID) {
					q = 40 + rand.Intn(120)
				}
				points = append(points, metricPoint{ts, "queue_depth", float64(q), map[string]string{"unit": "messages"}})
			}
			batch := metricBatch{
				BatchID:   fmt.Sprintf("tg-%s-%d", s.ID, ts.UnixNano()),
				TenantID:  e.cfg.tenant,
				ServiceID: s.ID,
				Cluster:   "demo",
				Namespace: "prod",
				Metrics:   points,
				Source:    "telemetry-gen",
			}
			if err := e.postJSON("/v1/ingest/metrics/batch", batch); err != nil {
				log.Printf("metrics ingest failed (%s): %v", s.ID, err)
			}
		}(s)
	}
	wg.Wait()
}

func (e *engine) emitLogs(at time.Time, traceIDs []string) {
	anomalous := map[string]bool{}
	for _, s := range e.services {
		if e.inAnomaly(s.ID) {
			anomalous[s.ID] = true
		}
	}
	var buf bytes.Buffer
	for _, s := range e.services {
		if s.Kind == "infra" {
			continue
		}
		n := 1 + rand.Intn(2)
		if anomalous[s.ID] {
			n = 4 + rand.Intn(3)
		}
		var traceID string
		if len(traceIDs) > 0 {
			traceID = traceIDs[rand.Intn(len(traceIDs))]
		}
		for i := 0; i < n; i++ {
			entry := logEntry{
				Timestamp: at,
				TenantID:  e.cfg.tenant,
				ServiceID: s.ID,
				Namespace: "prod",
				Message:   randomLine(s),
				Level:     randomLevel(s, anomalous[s.ID]),
				Labels:    map[string]string{"env": "prod", "source": "telemetry-gen"},
				TraceID:   traceID,
			}
			b, err := json.Marshal(entry)
			if err != nil {
				continue
			}
			buf.Write(b)
			buf.WriteByte('\n')
		}
	}
	if buf.Len() == 0 {
		return
	}
	if err := e.postRaw("/v1/ingest/logs/stream", buf.Bytes()); err != nil {
		log.Printf("logs ingest failed: %v", err)
	}
}

func randomLine(s *serviceModel) string {
	switch rand.Intn(10) {
	case 0, 1, 2, 3:
		return fmt.Sprintf(s.infoLogs[rand.Intn(len(s.infoLogs))], rand.Intn(500))
	case 4, 5:
		if len(s.debugLogs) > 0 {
			return fmt.Sprintf(s.debugLogs[rand.Intn(len(s.debugLogs))], rand.Intn(2000))
		}
	case 6:
		if len(s.warnLogs) > 0 {
			return fmt.Sprintf(s.warnLogs[rand.Intn(len(s.warnLogs))], rand.Intn(900))
		}
	default:
		if len(s.errorLogs) > 0 {
			return fmt.Sprintf(s.errorLogs[rand.Intn(len(s.errorLogs))], rand.Intn(900))
		}
	}
	return "heartbeat ok"
}

func randomLevel(s *serviceModel, anomalous bool) string {
	if anomalous {
		switch rand.Intn(10) {
		case 0, 1, 2:
			return "error"
		case 3:
			return "warn"
		case 4:
			return "info"
		default:
			return "error"
		}
	}
	switch rand.Intn(20) {
	case 0:
		return "warn"
	case 1, 2, 3:
		return "debug"
	default:
		return "info"
	}
}

// pickWeighted chooses a callee from callGraph[caller].
func pickWeighted(caller string) string {
	opts, ok := callGraph[caller]
	if !ok || len(opts) == 0 {
		return ""
	}
	r := rand.Float64()
	acc := 0.0
	for _, o := range opts {
		acc += o[1].(float64)
		if r <= acc {
			return o[0].(string)
		}
	}
	return opts[len(opts)-1][0].(string)
}

// buildTraces synthesizes the trace payload for a tick (pure: no I/O). Each
// trace is a caller->callee span chain; infra services appear as callee spans
// so the topology derives real dependency edges from parent/child links.
func (e *engine) buildTraces(at time.Time) (otlpTrace, []string) {
	var traceIDs []string
	var payload otlpTrace

	spanFor := func(svc *serviceModel, traceID, spanID, parentID, op string, start time.Time) otlpSpan {
		dur := e.latency(svc, start) + 0.5
		status := "OK"
		if e.inAnomaly(svc.ID) {
			status = "ERROR"
			dur = dur * 1.5
		}
		return otlpSpan{
			TraceID:      traceID,
			SpanID:       spanID,
			ParentSpanID: parentID,
			Name:         op,
			StartTime:    start,
			EndTime:      start.Add(time.Duration(dur*1000) * time.Millisecond),
			Status:       otlpSpanStatus{Code: status},
			Attributes: map[string]string{
				"service": svc.ID,
			},
		}
	}

	// group spans by service -> resourceSpans entry
	bySvc := map[string][]otlpSpan{}

	// entry services: gateway (majority) + worker
	entries := []string{"api-gateway", "api-gateway", "api-gateway", "checkout-worker"}
	for i := 0; i < 6; i++ {
		entries = append(entries, "api-gateway")
	}
	entries = append(entries, "notification-service")

	for _, entryID := range entries {
		entry := e.byID[entryID]
		if entry == nil {
			continue
		}
		traceID := randHex(16)
		traceIDs = append(traceIDs, traceID)
		now := at.Add(-time.Duration(rand.Intn(500)) * time.Millisecond)
		op := entry.operations[rand.Intn(len(entry.operations))]
		root := spanFor(entry, traceID, randHex(8), "", op, now)
		bySvc[entryID] = append(bySvc[entryID], root)

		// first hop
		callee := pickWeighted(entryID)
		if callee == "" {
			continue
		}
		c1 := e.byID[callee]
		if c1 == nil {
			continue
		}
		child := spanFor(c1, traceID, randHex(8), root.SpanID,
			c1.operations[rand.Intn(len(c1.operations))], now.Add(1*time.Millisecond))
		bySvc[callee] = append(bySvc[callee], child)

		// second hop (only for non-infra callers, keeps graph interesting)
		if c1.Kind != "infra" && rand.Float64() < 0.7 {
			callee2 := pickWeighted(callee)
			if callee2 != "" && callee2 != entryID {
				c2 := e.byID[callee2]
				if c2 != nil {
					grandchild := spanFor(c2, traceID, randHex(8), child.SpanID,
						c2.operations[rand.Intn(len(c2.operations))], now.Add(2*time.Millisecond))
					bySvc[callee2] = append(bySvc[callee2], grandchild)
				}
			}
		}
	}

	for svcID, spans := range bySvc {
		payload.ResourceSpans = append(payload.ResourceSpans, resourceSpan{
			Resource:   resource{Attributes: map[string]any{"service.name": map[string]any{"stringValue": svcID}}},
			ScopeSpans: []scopeSpans{{Spans: spans}},
		})
	}

	return payload, traceIDs
}

// emitTraces builds and ships the trace payload for a tick.
func (e *engine) emitTraces(at time.Time) ([]string, error) {
	payload, traceIDs := e.buildTraces(at)
	body, err := json.Marshal(payload)
	if err != nil {
		return traceIDs, err
	}
	if err := e.postRaw("/v1/ingest/traces", body); err != nil {
		log.Printf("traces ingest failed: %v", err)
		return traceIDs, err
	}
	return traceIDs, nil
}

func randHex(n int) string {
	const hex = "0123456789abcdef"
	b := make([]byte, n)
	for i := range b {
		b[i] = hex[rand.Intn(len(hex))]
	}
	return string(b)
}

// ── HTTP helpers (gzip + X-Tenant-Id, collector's agent ingest contract) ──

func (e *engine) postJSON(path string, v any) error {
	body, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return e.postRaw(path, body)
}

func (e *engine) postRaw(path string, body []byte) error {
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	if _, err := gw.Write(body); err != nil {
		return err
	}
	if err := gw.Close(); err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, e.cfg.collectorURL+path, &buf)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Content-Encoding", "gzip")
	req.Header.Set("X-Tenant-Id", e.cfg.tenant)
	req.Header.Set("X-Batch-Id", fmt.Sprintf("tg-%s-%d", path, time.Now().UnixNano()))

	resp, err := e.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("collector returned %s for %s", resp.Status, path)
	}
	return nil
}

// ── Backfill: seed minutes of history so pages are alive on first boot ───

func (e *engine) backfill(ctx context.Context, minutes int) {
	if minutes <= 0 {
		return
	}
	if minutes > 60 {
		minutes = 60
	}
	step := 15 * time.Second
	start := time.Now().Add(-time.Duration(minutes) * time.Minute)
	log.Printf("seeding %d minutes of history (15s granularity)...", minutes)

	for at := start; at.Before(time.Now()); at = at.Add(step) {
		select {
		case <-ctx.Done():
			return
		default:
		}
		e.emitMetrics(at)
		if int(at.Unix())%30 == 0 {
			e.emitLogs(at, nil)
		}
		if int(at.Unix())%60 == 0 {
			_, _ = e.emitTraces(at)
		}
		time.Sleep(15 * time.Millisecond)
	}
	log.Println("backfill complete")
}

// ── Main ────────────────────────────────────────────────────────────────

func loadConfig() config {
	url := getenv("COLLECTOR_URL", "http://localhost:8080")
	tickS := getenvInt("TICK_SECONDS", 5)
	if tickS < 1 {
		tickS = 1
	}
	return config{
		collectorURL: strings.TrimSuffix(url, "/"),
		tenant:       getenv("TENANT", "default"),
		tick:         time.Duration(tickS) * time.Second,
		backfillMin:  getenvInt("BACKFILL_MINUTES", 45),
		anomalies:    getenv("ANOMALIES", "1") != "0",
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getenvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func main() {
	cfg := loadConfig()
	e := newEngine(cfg)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go e.scheduler(ctx)

	// Wait for the collector to become reachable (it takes a few seconds to
	// connect to Kafka/ClickHouse/Redis on a fresh boot). Backfilling before it
	// is ready would silently drop the entire history seed — connection-refused
	// errors are only logged, never retried.
	if waitForCollector(ctx, e, 30*time.Second) {
		log.Printf("connected to collector at %s (tenant=%s, tick=%s)", cfg.collectorURL, cfg.tenant, cfg.tick)
		// Backfill first so every data page is populated immediately.
		e.backfill(ctx, cfg.backfillMin)
	} else {
		log.Printf("WARNING: collector at %s never became reachable within 30s — skipping backfill; the live loop keeps retrying each tick", cfg.collectorURL)
	}

	ticker := time.NewTicker(cfg.tick)
	defer ticker.Stop()
	log.Printf("telemetry-gen running (anomalies=%v) — Ctrl-C to stop", cfg.anomalies)

	for {
		select {
		case <-ctx.Done():
			log.Println("shutting down telemetry-gen")
			return
		case at := <-ticker.C:
			traceIDs, _ := e.emitTraces(at)
			e.emitMetrics(at)
			e.emitLogs(at, traceIDs)
		}
	}
}

func (e *engine) ping() error {
	req, err := http.NewRequest(http.MethodGet, e.cfg.collectorURL+"/v1/health", nil)
	if err != nil {
		return err
	}
	resp, err := e.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("health returned %s", resp.Status)
	}
	return nil
}

// waitForCollector polls the collector health endpoint until it answers or
// maxWait elapses. The collector takes a few seconds to wire Kafka/ClickHouse
// on a cold boot, so the backfill must wait for it instead of failing once.
func waitForCollector(ctx context.Context, e *engine, maxWait time.Duration) bool {
	deadline := time.Now().Add(maxWait)
	for {
		if err := e.ping(); err == nil {
			return true
		}
		if time.Now().After(deadline) {
			return false
		}
		select {
		case <-ctx.Done():
			return false
		case <-time.After(2 * time.Second):
		}
	}
}
