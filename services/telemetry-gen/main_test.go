package main

import (
	"testing"
	"time"
)

func TestServiceInventory(t *testing.T) {
	svcs := services()
	seen := map[string]bool{}
	for _, s := range svcs {
		if s.ID == "" {
			t.Fatal("service with empty id")
		}
		if seen[s.ID] {
			t.Fatalf("duplicate service id %s", s.ID)
		}
		seen[s.ID] = true
		if s.baseLatency < 0 {
			t.Fatalf("%s: negative base latency", s.ID)
		}
		if s.Kind != "app" && s.Kind != "worker" && s.Kind != "infra" {
			t.Fatalf("%s: unknown kind %s", s.ID, s.Kind)
		}
	}
	// Every app service must be a possible callee OR a caller with edges,
	// otherwise the topology graph misses services entirely.
	for _, s := range svcs {
		if s.Kind == "infra" {
			continue
		}
		if len(s.operations) == 0 {
			t.Fatalf("%s: no span operations defined", s.ID)
		}
	}
}

func TestValueBounds(t *testing.T) {
	cfg := loadConfig()
	// force a fixed config for deterministic-ish bounds checks
	cfg.tenant = "test"
	cfg.anomalies = true
	e := newEngine(cfg)
	at := time.Now()

	for _, s := range e.services {
		if s.Kind == "infra" {
			continue
		}
		// Anomaly-on latency must be an amplified (>= base) finite value.
		e.mu.Lock()
		e.anomalyEnds[s.ID] = time.Now().Add(time.Minute)
		e.mu.Unlock()

		lat := e.latency(s, at)
		if lat < 0 || lat > 100000 {
			t.Fatalf("%s: latency out of bounds: %v", s.ID, lat)
		}
		if lat < s.baseLatency {
			t.Fatalf("%s: anomaly latency (%v) below base (%v)", s.ID, lat, s.baseLatency)
		}
		errRate := e.errorRate(s, at)
		if errRate < 0 || errRate > 1 {
			t.Fatalf("%s: error rate out of bounds: %v", s.ID, errRate)
		}
		if errRate < 0.1 {
			t.Fatalf("%s: anomaly error rate should be elevated, got %v", s.ID, errRate)
		}
		c := e.cpu(s, at)
		if c < 0 || c > 100 {
			t.Fatalf("%s: cpu out of bounds: %v", s.ID, c)
		}
		m := e.mem(s, at)
		if m < 0 || m > 100 {
			t.Fatalf("%s: memory out of bounds: %v", s.ID, m)
		}
	}
}

func TestAnomalyLifecycle(t *testing.T) {
	e := newEngine(loadConfig())
	id := "payment-api"
	if e.inAnomaly(id) {
		t.Fatal("should not be anomalous initially")
	}
	e.mu.Lock()
	e.anomalyEnds[id] = time.Now().Add(30 * time.Second)
	e.mu.Unlock()
	if !e.inAnomaly(id) {
		t.Fatal("should be anomalous while episode active")
	}
	e.mu.Lock()
	e.anomalyEnds[id] = time.Now().Add(-time.Second)
	e.mu.Unlock()
	if e.inAnomaly(id) {
		t.Fatal("episode should expire after its end time")
	}
}

func TestCallGraphIntegrity(t *testing.T) {
	e := newEngine(loadConfig())
	for caller, opts := range callGraph {
		if e.byID[caller] == nil {
			t.Fatalf("caller %s not in service inventory", caller)
		}
		total := 0.0
		for _, o := range opts {
			if e.byID[o[0].(string)] == nil {
				t.Fatalf("%s -> %s: callee not in service inventory", caller, o[0])
			}
			total += o[1].(float64)
		}
		if total < 0.99 || total > 1.01 {
			t.Fatalf("%s: edge weights sum to %v (want ~1.0)", caller, total)
		}
	}
}

func TestBuildTracesShape(t *testing.T) {
	e := newEngine(loadConfig())
	at := time.Now()
	payload, traceIDs := e.buildTraces(at)
	if len(traceIDs) == 0 {
		t.Fatal("expected generated trace ids")
	}
	if len(payload.ResourceSpans) == 0 {
		t.Fatal("expected resourceSpans grouped by service")
	}
	// All span ids must be present and parent links must reference a span
	// emitted in the same trace (topology derives edges from these links).
	byTrace := map[string]map[string]bool{} // trace -> span ids
	for _, rs := range payload.ResourceSpans {
		if rs.Resource.Attributes["service.name"] == nil {
			t.Fatal("resourceSpans missing service.name")
		}
		for _, ss := range rs.ScopeSpans {
			for _, sp := range ss.Spans {
				if sp.SpanID == "" || sp.TraceID == "" {
					t.Fatalf("span missing ids: %+v", sp)
				}
				if !sp.EndTime.After(sp.StartTime) {
					t.Fatalf("span %s ends before it starts", sp.SpanID)
				}
				if byTrace[sp.TraceID] == nil {
					byTrace[sp.TraceID] = map[string]bool{}
				}
				byTrace[sp.TraceID][sp.SpanID] = true
			}
		}
	}
	for _, rs := range payload.ResourceSpans {
		for _, ss := range rs.ScopeSpans {
			for _, sp := range ss.Spans {
				if sp.ParentSpanID != "" && !byTrace[sp.TraceID][sp.ParentSpanID] {
					t.Fatalf("span %s references unknown parent %s", sp.SpanID, sp.ParentSpanID)
				}
			}
		}
	}
}
