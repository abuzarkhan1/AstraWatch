# AstraWatch — Intelligent Observability & Autonomous Remediation Platform
### Technical Design Document (Engineering Wiki Style)
**Version:** 1.0 · **Status:** Design Complete, Phased Implementation

---

## Table of Contents
1. Executive Summary & Scope Reality Check
2. System Architecture
3. Service Deep-Dives (C++, Go, Python, Java, Node.js, React, K8s Operator)
4. Full API Contracts (all services, all methods)
5. Database Schema (all tables, relations, indexing)
6. Kafka Event Catalog
7. Authentication & Authorization (deep)
8. Auto-Healing Engine — full decision logic
9. Anomaly Detection — full algorithm
10. Frontend Architecture
11. Security & Observability
12. Deployment & CI/CD
13. Realistic Phased Build Roadmap
14. Alert Fatigue & Noise Reduction
15. Runbook Automation & Knowledge Management
16. On-Call Management & Escalation
17. Synthetic & Proactive Monitoring
18. Status Page
19. AI Agent Integration & MCP
20. Multi-Tenancy & Data Isolation
21. Cost Management & Data Tiering
22. Configuration Management & Feature Flags
23. Service Catalog & Dependency Management
24. Compliance & Data Privacy
25. Disaster Recovery & Business Continuity
26. SLO/SLI Deep Design
27. Chaos Engineering & Resilience Testing
28. Meta-Observability & Self-Monitoring
29. API Versioning & Developer Experience
30. Backend Libraries & Dependencies

---

## 1. Executive Summary & Scope Reality Check

AstraWatch is a polyglot, event-driven observability and auto-remediation platform. It ingests
metrics/logs/traces, detects anomalies with an ML ensemble, decides on remediation actions through
a risk-scored decision engine, executes them via Kubernetes-native operators/workflows, and
visualizes everything in real time.

**Honest scoping note (read this before building):** this system, as specced, mirrors what a
10–30 engineer SRE/platform team builds over 12–18 months. Building it solo is possible **if you
treat it as a long-running project with clear phases** (see Section 13) rather than trying to
build all 7 services simultaneously. Each phase below is independently demoable and CV-worthy on
its own — you don't need to wait until everything is done to have something real to show.

---

## 2. System Architecture

### 2.1 High-Level Flow

```
┌─────────────┐     ┌──────────────┐     ┌───────────┐
│ C++ Agent   │────▶│ Go Collector │────▶│  Kafka    │
│ (eBPF/host) │gRPC │ (Ingest)     │     │  Broker   │
└─────────────┘     └──────────────┘     └─────┬─────┘
                                                │
                    ┌───────────────────────────┼───────────────────────┐
                    ▼                           ▼                       ▼
            ┌───────────────┐          ┌────────────────┐      ┌──────────────┐
            │ Python        │          │ TimescaleDB /  │      │ Node.js      │
            │ Analyzer      │─events──▶│ ClickHouse     │      │ Realtime     │
            │ (FastAPI, ML) │          │ (metric store) │      │ Gateway      │
            └───────┬───────┘          └────────────────┘      └──────┬───────┘
                    │ anomaly-detected                                │ WebSocket
                    ▼                                                 ▼
            ┌───────────────────┐                             ┌──────────────┐
            │ Java Orchestrator │◀────────approval/actions────│ React        │
            │ (Spring Boot)     │────────healing-triggered───▶│ Dashboard    │
            └─────────┬─────────┘                             └──────┬───────┘
                      │ K8s API / CRDs                               │ Billing API
                      ▼                                              ▼
            ┌───────────────────┐                             ┌──────────────┐
            │ K8s Operator      │                             │ Go Payment   │
            │ (Go controller)   │                             │ Service      │
            └───────────────────┘                             │ (Stripe API) │
                                                              └──────────────┘
```

### 2.2 Architectural Principles

| Principle | How it's applied |
|---|---|
| Event-driven | All cross-service communication after ingestion goes through Kafka, not direct sync calls (except Orchestrator→Analyzer root-cause query, which is sync HTTP with a timeout+fallback) |
| CQRS | Write path (ingest, healing actions) is separate from read path (dashboard queries hit read-replicas / materialized views) |
| Event Sourcing (partial) | Incident and HealingAction state changes are stored as an append-only event log, current state is a projection |
| Idempotency | Every mutating API requires an `Idempotency-Key` header; handled via a dedup table keyed on (key, endpoint) with 24h TTL |
| Failure isolation | Each service has its own DB/schema — no service reaches into another's tables directly |
| Backpressure | Go Collector uses bounded channels + worker pool; if Kafka is slow, agent-side buffering kicks in (see 3.1) |

### 2.3 Storage Responsibilities

| Store | Owns | Written by | Read by |
|---|---|---|---|
| ClickHouse / TimescaleDB | Raw + aggregated metrics (high volume) | Go Collector consumer | Python Analyzer, React (via Go query API) |
| PostgreSQL | Incidents, healing actions, users, roles, audit log | Java Orchestrator | Java Orchestrator, React |
| Elasticsearch | Logs | Go Collector (log path) | React log explorer |
| Redis | Cache, pub/sub for Socket.io fan-out, rate-limit counters, Celery broker | All services | All services |
| Prometheus | AstraWatch's own self-monitoring metrics | All services (via /metrics) | Grafana (self-monitoring dashboard) |

---

## 3. Service Deep-Dives

### 3.1 C++ Agent (Host / Kernel-level Metrics)

**Responsibility:** collect low-level metrics that only make sense to gather close to the kernel
(syscall latency, CPU scheduling delay, network socket stats) and ship them efficiently.

**Design:**
- Uses **eBPF** programs (via libbpf) attached to kernel tracepoints: `sched_switch` (scheduling
  latency), `tcp_sendmsg`/`tcp_recvmsg` (network), `block_rq_issue` (disk I/O).
- Userspace side reads from a **ring buffer** (`BPF_MAP_TYPE_RINGBUF`) — zero-copy, avoids the
  overhead of perf buffers.
- Batches events for 500ms (configurable) before flushing.
- **Local durability:** if the Go Collector is unreachable, the agent writes to a local
  memory-mapped ring file (max size configurable, e.g. 100MB) and retries with exponential
  backoff + jitter. On recovery, it drains the backlog before resuming live streaming, tagging
  backlogged points with their original timestamp so they don't distort real-time graphs.
- Transport: gRPC with Protobuf, `zstd` compression, mutual TLS (client cert issued per-host by
  Vault PKI).
- Failure mode: if local buffer also fills up, oldest data is dropped first (metrics are treated
  as best-effort; logs/traces are not dropped the same way — see below).

**Why C++ here specifically:** the only real justification for C++ in this system is kernel-level
eBPF work and the userspace loader for it — Go and Rust can also do eBPF (via cilium/ebpf), so if
your goal is to *simplify* the project, this is the safest service to defer or cut. It is *not*
required to hit "industry grade" — plenty of real observability platforms (Datadog, Grafana Agent)
do this in Go.

---

### 3.2 Go Collector Service (Gin)

**Responsibility:** the front door for all telemetry. Validates, enriches, and routes data into
Kafka. Also exposes the read-side query API used by the dashboard.

**Internal layout:**
```
services/collector/
├── cmd/collector/main.go
├── internal/
│   ├── ingest/        # HTTP/gRPC handlers
│   ├── validate/       # schema + timestamp sanity checks
│   ├── enrich/         # attach pod/namespace/cluster labels (from k8s API cache)
│   ├── produce/         # Kafka producer wrapper (Sarama or franz-go)
│   ├── query/           # read API: PromQL-like queries against ClickHouse
│   └── ratelimit/       # per-tenant token bucket
└── pkg/
```

**Key behaviors:**
- **Backpressure:** ingestion handler pushes onto a bounded Go channel (`chan MetricBatch`, size
  10k). A fixed pool of worker goroutines drains it into Kafka. If channel is full, the handler
  returns HTTP `429` with a `Retry-After` header rather than blocking indefinitely — this is what
  prevents one noisy agent from taking down the collector.
- **Idempotent ingestion:** each batch carries a client-generated `batchId`; a Redis `SETNX` with
  a short TTL (5 min) is used to detect and drop exact duplicate resends (handles retry storms).
- **Enrichment:** pod → namespace/cluster label lookup uses a local in-memory cache refreshed
  every 30s from the Kubernetes API (watch-based, not polling) so enrichment doesn't add a
  network hop per metric.
- **Kubernetes Operator** (also Go, separate binary sharing some packages) — see 3.7.

---

### 3.3 Python Analyzer Service (FastAPI)

**Responsibility:** anomaly detection, root cause analysis, forecasting.

**Layout:**
```
services/analyzer/
├── app/
│   ├── routers/ (anomaly.py, rootcause.py, predict.py, models.py)
│   ├── services/anomaly_service.py
│   ├── ml/
│   │   ├── ensemble.py
│   │   ├── detectors/ (statistical.py, isolation_forest.py, lstm_autoencoder.py)
│   │   ├── causal.py
│   │   └── features/feature_engineering.py
│   ├── core/ (config.py, kafka_client.py)
│   └── schemas/
├── training/           # separate offline pipeline, not part of the live API
│   ├── retrain_job.py
│   └── evaluate.py
```

**Detection pipeline (full detail in Section 9).**

**Why this is a real service and not "just call an API":** the ensemble combines cheap statistical
detectors (fast, always-on, catch obvious spikes) with heavier models (LSTM autoencoder, run on a
schedule or on-demand for flagged services only) — this tiered approach is what makes it
computationally feasible; you are **not** running an LSTM inference on every single metric point
in real time.

---

### 3.4 Java Spring Boot Orchestrator ("the brain")

**Responsibility:** incident lifecycle, healing decision-making, workflow execution, auth.

**Package layout (hexagonal/clean architecture):**
```
com.astrawatch.orchestrator/
├── domain/
│   ├── model/ (Incident, HealingAction, ServiceHealth, SLO, User, Role)
│   ├── event/ (AnomalyDetected, HealingTriggered, IncidentResolved)
├── application/
│   ├── service/ (IncidentCommandService, HealingOrchestrationService, RiskScoringService)
│   ├── port/out/ (KafkaProducerPort, AnalyzerClientPort, K8sClientPort)
├── adapter/
│   ├── out/persistence/  (JPA repos)
│   ├── out/kafka/        (producers)
│   ├── out/external/     (WebClient wrappers for Python + Go)
│   └── in/web/ (controllers, DTOs, mappers)
│   └── in/event/ (Kafka @KafkaListener consumers)
├── infrastructure/ (config, security, scheduler)
```

**Why hexagonal architecture matters here (not just buzzword):** the `application` layer never
imports anything from `adapter` — it depends only on `port` interfaces. This means you can unit
test `HealingOrchestrationService` with a fake `AnalyzerClientPort` without spinning up Python at
all, and you can swap Temporal for a simpler in-house state machine later without touching
business logic. This is the single most valuable "industry" habit to actually practice, more than
any specific tech choice.

**State machine (incident lifecycle):**
```
DETECTED → TRIAGED → INVESTIGATING → HEALING → VALIDATING → RESOLVED
                                          │
                                          └──(validation fails)──▶ ROLLED_BACK → ESCALATED
```
Implemented with Spring Statemachine; illegal transitions throw and are rejected at the API layer
before ever reaching the DB.

**Workflow execution:** long-running healing actions (scale → wait → validate → maybe rollback)
are modeled as **Temporal workflows** specifically because they need to:
- survive a pod restart of the Orchestrator mid-workflow (Temporal persists workflow state)
- support explicit compensation logic (rollback) as a first-class concept
- give you a UI (Temporal Web) to see exactly which step a stuck healing action is on

If Temporal feels like too much infra to run at your stage, a documented fallback is a simple
`healing_workflow_state` table + a scheduled poller — note this explicitly as a "v1 shortcut" in
your own docs so you can explain the tradeoff in an interview.

---

### 3.5 Node.js Real-time Gateway

**Responsibility:** fan out events to connected dashboard clients over WebSocket.

**Layout:**
```
services/realtime/
├── src/
│   ├── sockets/ (dashboard.socket.js, incidents.socket.js)
│   ├── kafka/consumer.js   # consumes anomaly-detected, healing-*, incident-*
│   ├── redis/adapter.js    # @socket.io/redis-adapter for horizontal scaling
│   └── auth/socketAuth.js  # validates JWT on socket handshake
```

**Key behaviors:**
- Socket.io with the **Redis adapter** so that a client connected to instance A still receives
  events published by a Kafka consumer running on instance B.
- Server-side event de-duplication using `eventId` (Kafka message key) — a client reconnecting
  after a network blip can replay the last N seconds without seeing duplicates.
- Auth: JWT passed during the socket handshake (`auth: { token }`), validated once at connect
  time, and re-validated on a timer (every 10 min) to handle token expiry mid-session by forcing
  a reconnect.

---

### 3.6 React Frontend

Covered in depth in Section 10.

---

### 3.7 Kubernetes Operator (Go, controller-runtime/Kubebuilder)

**Custom Resource Definitions:**

```yaml
apiVersion: astrawatch.io/v1
kind: AutoHealingRule
metadata:
  name: payment-service-latency-rule
spec:
  targetService: payment-v2
  condition:
    metric: latency_p95
    operator: GreaterThan
    threshold: 500
    forDuration: 3m
  action:
    type: ScaleDeployment
    parameters:
      maxReplicas: 10
      stepSize: 2
  riskLevel: Low
status:
  lastTriggered: "2026-07-29T10:12:00Z"
  triggerCount: 4
```

**Reconciler loop (pseudocode-level, real logic):**
```go
func (r *AutoHealingRuleReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    var rule astrawatchv1.AutoHealingRule
    if err := r.Get(ctx, req.NamespacedName, &rule); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    currentMetric, err := r.MetricsClient.GetLatest(rule.Spec.TargetService, rule.Spec.Condition.Metric)
    if err != nil {
        return ctrl.Result{RequeueAfter: 30 * time.Second}, err
    }

    if conditionMet(currentMetric, rule.Spec.Condition) {
        if err := r.OrchestratorClient.TriggerHealing(rule); err != nil {
            r.Recorder.Event(&rule, corev1.EventTypeWarning, "TriggerFailed", err.Error())
            return ctrl.Result{RequeueAfter: 30 * time.Second}, nil
        }
        rule.Status.LastTriggered = metav1.Now()
        rule.Status.TriggerCount++
        r.Status().Update(ctx, &rule)
    }

    return ctrl.Result{RequeueAfter: 30 * time.Second}, nil
}
```
Note the reconciler **does not execute the healing action itself** — it delegates to the Java
Orchestrator via API call. This keeps the Operator's job narrow (watch state, trigger decisions)
and keeps all risk-scoring/approval logic in one place instead of duplicated in Go and Java.

**Finalizers:** used on `AutoHealingRule` deletion to ensure any in-flight healing workflow
referencing that rule is either completed or explicitly cancelled before the CR is removed from
etcd — prevents orphaned Temporal workflows.

---

### 3.8 Go Payment & Billing Service (Go 1.22+, Stripe API)

**Responsibility:** manage tenant subscriptions, Stripe Checkout sessions, billing portal redirects, and webhook lifecycle events. Runs on port `8085`.

**Package layout:**
```
services/payment-service/
├── cmd/server/main.go          # HTTP server entry point & router (:8085)
├── go.mod                      # Module astrawatch/payment-service (Go 1.22+)
├── internal/
│   ├── config/                 # Environment variables (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PORT)
│   ├── handlers/               # HTTP handlers for checkout, portal, subscriptions, webhook
│   └── stripe/                 # Abstracted Stripe SDK client interface (mystripe.Client)
```

**Key behaviors:**
- **Stripe Checkout Sessions:** `POST /api/v1/billing/checkout-session` generates Stripe Checkout URLs for Pro ($49/mo) and Enterprise ($299/mo) tiers.
- **Stripe Customer Portal:** `POST /api/v1/billing/portal-session` generates Customer Portal URLs allowing users to update payment methods and view invoices.
- **Stripe Webhook Listener:** `POST /api/v1/billing/webhook` handles signed events (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`).
- **Mockable Interface Architecture:** `mystripe.Client` interface allows full unit testing via `httptest` without live network calls to Stripe.

---

## 4. Full API Contracts

> Convention: all responses wrapped in `{ success, data, meta: { timestamp, traceId } }`. All
> mutating endpoints require `Idempotency-Key` header. All endpoints require `Authorization:
> Bearer <JWT>` except `/auth/*`.

### 4.1 Auth Service (Java)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| POST | `/api/v1/auth/login` | `{email, password, mfaCode?}` | `{accessToken, refreshToken, expiresIn}` | Rate-limited 5/min per IP |
| POST | `/api/v1/auth/refresh` | `{refreshToken}` | `{accessToken, expiresIn}` | Rotates refresh token (single-use) |
| POST | `/api/v1/auth/logout` | `{refreshToken}` | `204` | Adds token to Redis blocklist until natural expiry |
| GET | `/api/v1/auth/me` | — | `{userId, email, roles, permissions, currentTeam}` | |
| POST | `/api/v1/auth/switch-team` | `{teamId}` | `{accessToken}` | Reissues token with new team claim |

### 4.2 Ingestion (Go)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| POST | `/v1/ingest/metrics/batch` | Protobuf `MetricBatch` | `202 {accepted, rejected}` | Max 5MB body, gzip/zstd accepted |
| POST | `/v1/ingest/logs/stream` | Chunked NDJSON | `202` | Streaming; per-line validation |
| POST | `/v1/ingest/traces` | OTLP protobuf | `202` | Passthrough to Jaeger collector after enrichment |
| GET | `/v1/query` | Query params: `service, metric, from, to, step` | `{series: [...]}` | Read path, hits ClickHouse |
| GET | `/v1/health` | — | `{status, uptime, kafkaLag}` | Used by K8s liveness probe |

### 4.3 Anomaly Detection (Python)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/v1/anomaly/detect` | `{serviceId, metrics: [{ts, name, value}], window}` | `{isAnomaly, score, contributingMetrics, rootCauses, prediction30min}` |
| POST | `/v1/anomaly/root-cause` | `{incidentId, metricsWindow}` | `{rankedCauses: [{metric, confidence, laggedBy}]}` |
| POST | `/v1/predict/timeseries` | `{serviceId, metric, horizonMinutes}` | `{forecast: [{ts, value, confidenceInterval}]}` |
| GET | `/v1/models/status` | — | `{models: [{name, version, lastTrained, accuracy}]}` |
| POST | `/v1/models/retrain` | `{modelName}` (admin-only) | `202 {jobId}` |

### 4.4 Incidents (Java)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/v1/incidents` | `{serviceId, anomalyId, severity}` | `{incident}` |
| GET | `/api/v1/incidents?status=&service=&from=&to=` | — | `{items: [...], page, total}` |
| GET | `/api/v1/incidents/{id}` | — | `{incident, timeline, rootCause}` |
| POST | `/api/v1/incidents/{id}/assign` | `{userId}` | `{incident}` |
| POST | `/api/v1/incidents/{id}/comment` | `{text}` | `{comment}` |
| POST | `/api/v1/incidents/{id}/resolve` | `{resolutionNote}` | `{incident}` |
| POST | `/api/v1/incidents/{id}/escalate` | `{escalateTo, reason}` | `{incident}` |

### 4.5 Healing (Java)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/v1/healing/trigger` | `{incidentId, actionType, parameters}` | `{action, riskScore, requiresApproval}` |
| GET | `/api/v1/healing/history?serviceId=` | — | `{items: [...]}` |
| POST | `/api/v1/healing/approve/{actionId}` | `{approvedBy}` | `{action}` |
| POST | `/api/v1/healing/rollback/{actionId}` | `{reason}` | `{action}` |
| GET | `/api/v1/healing/{actionId}/validation` | — | `{beforeMetrics, afterMetrics, passed}` |

### 4.6 SLO (Java)

| Method | Path | Response |
|---|---|---|
| GET | `/api/v1/slo/{serviceId}` | `{sloTarget, currentAttainment, errorBudgetRemaining, burnRate}` |
| POST | `/api/v1/slo` | `{slo}` (create/update definition) |

### 4.7 Node.js WebSocket Events

| Event (client subscribes) | Payload | Fired when |
|---|---|---|
| `dashboard:subscribe` | `{clusterIds: []}` | client requests live dashboard feed |
| `anomaly.detected` | `{serviceId, score, ts}` | Kafka consumer relays it |
| `healing.started` / `healing.completed` | `{actionId, incidentId, status}` | |
| `incident.updated` | `{incidentId, field, newValue}` | |
| `slo.breaching` | `{serviceId, burnRate}` | |

---

### 4.8 Auth Enhancements (Java)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| POST | `/api/v1/auth/register` | `{email, password, name, teamId?}` | `{userId, requiresVerification}` | Rate-limited 3/min per IP; sends verification email |
| POST | `/api/v1/auth/verify-email` | `{token}` | `{verified}` | Token expires in 24h |
| POST | `/api/v1/auth/resend-verification` | `{email}` | `202` | Rate-limited 1/min per email |
| POST | `/api/v1/auth/forgot-password` | `{email}` | `202` | Always returns 202 to prevent email enumeration |
| POST | `/api/v1/auth/reset-password` | `{token, newPassword}` | `{success}` | Token expires in 1h, single-use |
| POST | `/api/v1/auth/change-password` | `{currentPassword, newPassword}` | `{success}` | Requires re-auth if password changed < 5min ago |
| POST | `/api/v1/auth/mfa/setup` | — | `{secret, qrCodeUrl, backupCodes}` | Returns 10x single-use backup codes |
| POST | `/api/v1/auth/mfa/verify` | `{code}` | `{enabled}` | First-time setup confirmation |
| POST | `/api/v1/auth/mfa/disable` | `{code, backupCode?}` | `{disabled}` | Requires current TOTP or backup code |
| POST | `/api/v1/auth/lockout/status` | — | `{locked, remainingAttempts, cooldownSeconds}` | |
| GET | `/api/v1/auth/sessions` | — | `{sessions: [{id, device, ip, lastActive, createdAt}]}` | Active sessions list |
| DELETE | `/api/v1/auth/sessions/{id}` | — | `204` | Terminate specific session |
| DELETE | `/api/v1/auth/sessions` | — | `204` | Terminate all other sessions |
| POST | `/api/v1/auth/api-keys` | `{name, scopes, expiresAt?}` | `{id, key, createdAt}` | Key shown once; store securely |
| GET | `/api/v1/auth/api-keys` | — | `{keys: [{id, name, scopes, expiresAt, lastUsed}]}` | |
| DELETE | `/api/v1/auth/api-keys/{id}` | — | `204` | Immediate revocation |
| POST | `/api/v1/auth/invite` | `{email, role, teamId}` | `{inviteId}` | TeamOwner/Admin only; sends invitation email |
| POST | `/api/v1/auth/accept-invite` | `{token, password?}` | `{accessToken, refreshToken}` | Creates account if new user |

### 4.9 Incidents Enhanced (Java)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| POST | `/api/v1/incidents/manual` | `{serviceId, title, severity, description}` | `{incident}` | Manually reported incident |
| POST | `/api/v1/incidents/{id}/merge` | `{incidentIds: []}` | `{incident}` | Merges source incidents into target; closes sources |
| POST | `/api/v1/incidents/{id}/link` | `{incidentId, relationship}` | `{linked}` | Relationship: CAUSES, CAUSED_BY, RELATED, DUPLICATE |
| POST | `/api/v1/incidents/{id}/reopen` | `{reason}` | `{incident}` | Only from RESOLVED state |
| POST | `/api/v1/incidents/{id}/tags` | `{tags: []}` | `{tags}` | Replace all tags |
| POST | `/api/v1/incidents/{id}/attachments` | Multipart file | `{attachment}` | Max 25MB per file |
| GET | `/api/v1/incidents/{id}/attachments` | — | `{attachments: []}` | |
| GET | `/api/v1/incidents/{id}/timeline` | — | `{events: [...]}` | Rich timeline with all state transitions |
| POST | `/api/v1/incidents/{id}/acknowledge` | — | `{incident}` | Distinct from assign; stops escalation timer |
| POST | `/api/v1/incidents/{id}/sla` | — | `{slaDeadline, remainingBreachTime}` | SLA calculation based on severity |
| GET | `/api/v1/incidents/stats` | Query: `from, to, groupBy` | `{mtbf, mttd, mtta, mttr, trends}` | |

### 4.10 Notifications & Alerting API (Java)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| GET | `/api/v1/notifications/channels` | — | `{channels: [{id, type, config}]}` | Slack, PagerDuty, Email, Webhook, etc. |
| POST | `/api/v1/notifications/channels` | `{type, name, config}` | `{channel}` | config varies by type (webhookUrl, apiKey, etc.) |
| PUT | `/api/v1/notifications/channels/{id}` | `{config}` | `{channel}` | |
| DELETE | `/api/v1/notifications/channels/{id}` | — | `204` | |
| POST | `/api/v1/notifications/channels/{id}/test` | — | `{delivered, responseCode}` | Sends test payload |
| GET | `/api/v1/notifications/rules` | — | `{rules: [...]}` | Alert routing rules |
| POST | `/api/v1/notifications/rules` | `{name, conditions, channelIds, severity}` | `{rule}` | e.g. "CRITICAL → PagerDuty, LOW → Slack" |
| POST | `/api/v1/notifications/rules/{id}/test` | `{mockAlert}` | `{matchedChannels, deliveries}` | |
| POST | `/api/v1/notifications/maintenance-windows` | `{serviceIds, startTime, endTime, reason}` | `{window}` | Suppresses alerts during window |
| GET | `/api/v1/notifications/maintenance-windows?active=` | — | `{windows: [...]}` | |
| DELETE | `/api/v1/notifications/maintenance-windows/{id}` | — | `204` | |
| GET | `/api/v1/notifications/preferences` | — | `{email, slack, sms, push, quietHours}` | Per-user notification preferences |
| PUT | `/api/v1/notifications/preferences` | `{preferences}` | `{preferences}` | |

### 4.11 Status Page API (Java)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| GET | `/api/v1/status-page` | — | `{components, incidents, uptime}` | Public endpoint, no auth required |
| POST | `/api/v1/status-page/components` | `{name, description, group}` | `{component}` | e.g. API, Database, CDN |
| PUT | `/api/v1/status-page/components/{id}/status` | `{status, note}` | `{component}` | OPERATIONAL, DEGRADED, PARTIAL_OUTAGE, MAJOR_OUTAGE |
| GET | `/api/v1/status-page/subscribers` | — | `{subscribers: [{email, phone, webhook}]}` | |
| POST | `/api/v1/status-page/subscribers` | `{email?, phone?, webhook?}` | `{subscriber}` | |
| DELETE | `/api/v1/status-page/subscribers/{id}` | — | `204` | |
| POST | `/api/v1/status-page/maintenance` | `{components, startTime, endTime, description}` | `{maintenance}` | Scheduled maintenance announcement |
| GET | `/api/v1/status-page/history?days=` | — | `{uptimePercentages, incidents}` | Historical uptime per component |

### 4.12 Service Catalog API (Go)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| GET | `/api/v1/catalog/services` | — | `{services: [{id, name, team, tier, healthScore}]}` | |
| POST | `/api/v1/catalog/services` | `{name, teamId, tier, owner, docsUrl}` | `{service}` | Tier: CRITICAL, HIGH, MEDIUM, LOW |
| PUT | `/api/v1/catalog/services/{id}` | `{fields}` | `{service}` | |
| GET | `/api/v1/catalog/services/{id}/dependencies` | — | `{upstream: [], downstream: []}` | Dependency graph from traces |
| POST | `/api/v1/catalog/services/{id}/scorecard` | `{metrics}` | `{scorecard}` | Composite health calculation |

### 4.13 Postmortem API (Java)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| POST | `/api/v1/incidents/{id}/postmortem` | `{summary, timelineEdits, contributingFactors, actionItems}` | `{postmortem}` | |
| GET | `/api/v1/incidents/{id}/postmortem` | — | `{postmortem}` | |
| PUT | `/api/v1/incidents/{id}/postmortem` | `{fields}` | `{postmortem}` | |
| POST | `/api/v1/incidents/{id}/postmortem/export` | `{format}` | — | Returns PDF/Markdown/HTML |
| POST | `/api/v1/incidents/{id}/action-items` | `{description, owner, dueDate}` | `{actionItem}` | |
| GET | `/api/v1/incidents/{id}/action-items` | — | `{items: [...]}` | |
| PUT | `/api/v1/action-items/{id}/status` | `{status}` | `{actionItem}` | OPEN, IN_PROGRESS, DONE, WONT_DO |

### 4.14 Runbook API (Java)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| GET | `/api/v1/runbooks` | Query: `serviceId, tag` | `{runbooks: [...]}` | |
| POST | `/api/v1/runbooks` | `{serviceId, title, steps, tags, actionType}` | `{runbook}` | Steps = ordered markdown or structured YAML |
| PUT | `/api/v1/runbooks/{id}` | `{fields}` | `{runbook}` | Versioned; creates new revision |
| GET | `/api/v1/runbooks/{id}/versions` | — | `{versions: [{revision, author, timestamp}]}` | |
| POST | `/api/v1/runbooks/{id}/execute` | `{incidentId?, parameters}` | `{executionId}` | Execute runbook steps via Temporal |
| GET | `/api/v1/runbooks/{id}/executions` | — | `{executions: [...]}` | Historical execution log |

### 4.15 Synthetic Monitoring API (Python/Node.js)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| GET | `/api/v1/synthetic/checks` | — | `{checks: [...]}` | |
| POST | `/api/v1/synthetic/checks` | `{type, target, interval, regions, assertions}` | `{check}` | type: HTTP, TCP, DNS, BROWSER, SSL |
| PUT | `/api/v1/synthetic/checks/{id}` | `{fields}` | `{check}` | |
| DELETE | `/api/v1/synthetic/checks/{id}` | — | `204` | |
| GET | `/api/v1/synthetic/checks/{id}/results` | Query: `from, to` | `{results: [{timestamp, responseTime, statusCode, region, passed}]}` | |
| POST | `/api/v1/synthetic/checks/{id}/run` | — | `{result}` | On-demand manual run |

### 4.16 Stripe Payment & Billing API (Go)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| POST | `/api/v1/billing/checkout-session` | `{planName, isYearly, price}` | `{url}` | Creates Stripe Checkout Session URL for Pro ($49/mo) and Enterprise ($299/mo) |
| POST | `/api/v1/billing/portal-session` | `{returnUrl?}` | `{url}` | Creates Stripe Customer Billing Portal URL |
| GET | `/api/v1/billing/subscriptions` | — | `{status, plan, periodEnd, items}` | Returns current tenant subscription details |
| POST | `/api/v1/billing/webhook` | Stripe Event JSON | `{status}` | Webhook handler with `STRIPE_WEBHOOK_SECRET` signature verification |
| GET | `/healthz` | — | `ok` | Service health check endpoint (:8085) |

---

## 5. Database Schema

### 5.1 PostgreSQL (Orchestrator — incidents, healing, auth)

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    mfa_secret TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_team_roles (
    user_id UUID REFERENCES users(id),
    team_id UUID REFERENCES teams(id),
    role VARCHAR(50) NOT NULL, -- PlatformAdmin, SRE, Viewer, TeamOwner
    PRIMARY KEY (user_id, team_id)
);

CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    team_id UUID REFERENCES teams(id),
    cluster VARCHAR(100),
    namespace VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_services_team ON services(team_id);

CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID REFERENCES services(id),
    anomaly_id UUID,
    severity VARCHAR(20) NOT NULL, -- LOW, MEDIUM, HIGH, CRITICAL
    state VARCHAR(30) NOT NULL DEFAULT 'DETECTED',
    assigned_to UUID REFERENCES users(id),
    root_cause JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_incidents_service_state ON incidents(service_id, state);
CREATE INDEX idx_incidents_created ON incidents(created_at DESC);

CREATE TABLE incident_events ( -- event-sourced timeline
    id BIGSERIAL PRIMARY KEY,
    incident_id UUID REFERENCES incidents(id),
    event_type VARCHAR(50) NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_incident_events_incident ON incident_events(incident_id, created_at);

CREATE TABLE healing_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES incidents(id),
    action_type VARCHAR(50) NOT NULL,
    parameters JSONB,
    risk_score SMALLINT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, EXECUTING, VALIDATING, COMPLETED, ROLLED_BACK, FAILED
    approved_by UUID REFERENCES users(id),
    before_metrics JSONB,
    after_metrics JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX idx_healing_incident ON healing_actions(incident_id);

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_actor ON audit_log(actor_id, created_at DESC);

CREATE TABLE slo_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID REFERENCES services(id),
    metric VARCHAR(100),
    target_percentage NUMERIC(5,2), -- e.g. 99.90
    window_days SMALLINT DEFAULT 30
);

CREATE TABLE idempotency_keys (
    key VARCHAR(200) PRIMARY KEY,
    endpoint VARCHAR(200) NOT NULL,
    response_snapshot JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
-- cleaned up via cron: DELETE WHERE created_at < now() - interval '24 hours'
```

### 5.2 ClickHouse (metrics — high write volume, columnar)

```sql
CREATE TABLE metrics (
    service_id String,
    cluster String,
    metric_name String,
    ts DateTime64(3),
    value Float64,
    labels Map(String, String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(ts)
ORDER BY (service_id, metric_name, ts)
TTL ts + INTERVAL 90 DAY;
```
Downsampled rollup tables (`metrics_5m`, `metrics_1h`) are populated via materialized views for
fast dashboard queries over long ranges without scanning raw data.

### 5.3 Elasticsearch (logs)

Index pattern `logs-{service}-{yyyy.MM.dd}`, ILM policy: hot for 7 days → warm for 23 days →
delete at 30 days (configurable per team/tier).

### 5.4 Additional PostgreSQL Tables

```sql
-- Password management
CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_password_reset_token ON password_reset_tokens(token_hash);

CREATE TABLE email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE password_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_password_history_user ON password_history(user_id, created_at DESC);

-- Session management
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    refresh_token_hash TEXT NOT NULL,
    device_info JSONB, -- user_agent, ip, device_type
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_active_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_user_sessions_active ON user_sessions(user_id, is_active) WHERE is_active = true;

CREATE TABLE login_attempts (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    ip VARCHAR(45),
    success BOOLEAN,
    failure_reason VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_login_attempts_user ON login_attempts(user_id, created_at DESC);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip, created_at DESC);

-- MFA recovery
CREATE TABLE mfa_backup_codes (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    code_hash TEXT NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- API keys / service accounts
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    key_prefix VARCHAR(8) NOT NULL, -- first 8 chars for identification
    key_hash TEXT NOT NULL,
    scopes TEXT[] NOT NULL, -- e.g. {metrics:read, incidents:write}
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    is_revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);

-- Organizations / Workspaces (beyond teams)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}',
    billing_plan VARCHAR(50) DEFAULT 'free',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE teams ADD COLUMN org_id UUID REFERENCES organizations(id);

CREATE TABLE organization_members (
    org_id UUID REFERENCES organizations(id),
    user_id UUID REFERENCES users(id),
    role VARCHAR(50) NOT NULL, -- Owner, Admin, Member
    joined_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (org_id, user_id)
);

-- Invitations
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    team_id UUID REFERENCES teams(id),
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Notification channels
CREATE TABLE notification_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL, -- slack, pagerduty, email, sms, webhook, teams, discord
    config JSONB NOT NULL, -- webhookUrl, apiKey, channel, phone, etc.
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Notification preferences
CREATE TABLE notification_preferences (
    user_id UUID REFERENCES users(id),
    channel_type VARCHAR(50) NOT NULL, -- email, slack, sms, push
    severity_min VARCHAR(20) DEFAULT 'LOW', -- only notifications >= this severity
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    is_enabled BOOLEAN DEFAULT true,
    PRIMARY KEY (user_id, channel_type)
);

-- Notification rules
CREATE TABLE notification_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    conditions JSONB NOT NULL, -- {severity: [CRITICAL], services: [...], timeWindow: {...}}
    channel_ids UUID[] NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Maintenance windows
CREATE TABLE maintenance_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    service_ids UUID[] NOT NULL,
    reason TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- On-call schedules
CREATE TABLE on_call_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    rotation_type VARCHAR(50) NOT NULL, -- weekly, daily, follow_the_sun, custom
    timezone VARCHAR(100) DEFAULT 'UTC',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE on_call_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID REFERENCES on_call_schedules(id),
    user_id UUID REFERENCES users(id),
    role VARCHAR(50) NOT NULL DEFAULT 'PRIMARY', -- PRIMARY, SECONDARY, ESCALATION
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_on_call_active ON on_call_entries(starts_at, ends_at);

-- Escalation policies
CREATE TABLE escalation_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    rules JSONB NOT NULL, -- [{escalateAfterSeconds: 300, notify: [...], target: PRIMARY|SECONDARY}]
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Postmortems
CREATE TABLE postmortems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES incidents(id) UNIQUE,
    summary TEXT,
    timeline_edits JSONB,
    contributing_factors TEXT[],
    severity_was_accurate BOOLEAN,
    lessons_learned TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE action_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    postmortem_id UUID REFERENCES postmortems(id),
    description TEXT NOT NULL,
    owner_id UUID REFERENCES users(id),
    status VARCHAR(30) DEFAULT 'OPEN', -- OPEN, IN_PROGRESS, DONE, WONT_DO
    due_date DATE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Runbooks
CREATE TABLE runbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID REFERENCES services(id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    steps JSONB NOT NULL, -- [{order, name, description, command, expectedOutcome, rollback}]
    tags TEXT[],
    action_type VARCHAR(50), -- RESTART_POD, SCALE_DEPLOYMENT, CUSTOM_SCRIPT, WEBHOOK
    current_revision INT DEFAULT 1,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE runbook_versions (
    id BIGSERIAL PRIMARY KEY,
    runbook_id UUID REFERENCES runbooks(id),
    revision INT NOT NULL,
    steps JSONB NOT NULL,
    changelog TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Synthetic checks
CREATE TABLE synthetic_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL, -- HTTP, TCP, DNS, BROWSER, SSL
    target VARCHAR(500) NOT NULL,
    config JSONB, -- assertions, headers, body, script
    interval_seconds INT DEFAULT 300,
    regions TEXT[] DEFAULT '{"us-east-1"}',
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE synthetic_check_results (
    id BIGSERIAL PRIMARY KEY,
    check_id UUID REFERENCES synthetic_checks(id),
    region VARCHAR(50),
    response_time_ms INT,
    status_code INT,
    passed BOOLEAN NOT NULL,
    error_message TEXT,
    checked_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_synthetic_results_check ON synthetic_check_results(check_id, checked_at DESC);

-- Dead letter queue
CREATE TABLE dead_letter_queue (
    id BIGSERIAL PRIMARY KEY,
    topic VARCHAR(100) NOT NULL,
    partition INT,
    offset BIGINT,
    key VARCHAR(500),
    value TEXT,
    error_message TEXT,
    error_count INT DEFAULT 1,
    last_error_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Feature flags
CREATE TABLE feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    is_enabled BOOLEAN DEFAULT false,
    targeting_rules JSONB, -- user segments, percentage rollout
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Status page
CREATE TABLE status_page_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    group_name VARCHAR(100),
    status VARCHAR(50) DEFAULT 'OPERATIONAL', -- OPERATIONAL, DEGRADED, PARTIAL_OUTAGE, MAJOR_OUTAGE
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE status_page_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    email VARCHAR(255),
    phone VARCHAR(50),
    webhook_url VARCHAR(500),
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE status_page_maintenances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    component_ids UUID[],
    title VARCHAR(200) NOT NULL,
    description TEXT,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) DEFAULT 'SCHEDULED', -- SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Service catalog
CREATE TABLE service_scorecards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID REFERENCES services(id),
    reliability_score NUMERIC(3,2),
    latency_score NUMERIC(3,2),
    error_rate_score NUMERIC(3,2),
    slo_attainment NUMERIC(5,2),
    calculated_at TIMESTAMPTZ DEFAULT now()
);

-- Configuration
CREATE TABLE system_config (
    key VARCHAR(200) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Webhook outbound
CREATE TABLE webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    url VARCHAR(500) NOT NULL,
    events TEXT[] NOT NULL, -- incident.created, healing.completed, etc.
    secret TEXT, -- HMAC signing secret
    is_enabled BOOLEAN DEFAULT true,
    retry_count INT DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Billing / Usage
CREATE TABLE usage_records (
    id BIGSERIAL PRIMARY KEY,
    org_id UUID REFERENCES organizations(id),
    metric_type VARCHAR(50) NOT NULL, -- metrics_ingested, logs_gb, trace_span_count, alert_count
    value BIGINT NOT NULL,
    recorded_at DATE NOT NULL
);
CREATE INDEX idx_usage_org_date ON usage_records(org_id, recorded_at);

CREATE TABLE billing_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) UNIQUE,
    plan VARCHAR(50) NOT NULL DEFAULT 'free',
    status VARCHAR(50) DEFAULT 'active', -- active, past_due, canceled, trialing
    current_period_start DATE,
    current_period_end DATE,
    stripe_customer_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Audit enhancements
ALTER TABLE audit_log ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE audit_log ADD COLUMN ip_address VARCHAR(45);
ALTER TABLE audit_log ADD COLUMN user_agent TEXT;
CREATE INDEX idx_audit_org ON audit_log(org_id, created_at DESC);
```

---

## 6. Kafka Event Catalog

| Topic | Producer | Consumer(s) | Key | Retention |
|---|---|---|---|---|
| `raw-metrics` | Go Collector | ClickHouse sink connector | serviceId | 24h (transient) |
| `anomaly-detected` | Python Analyzer | Java Orchestrator, Node.js | serviceId | 7d |
| `incident-created` / `incident-updated` | Java Orchestrator | Node.js | incidentId | 7d |
| `healing-triggered` / `healing-completed` | Java Orchestrator | Node.js, audit consumer | actionId | 30d |
| `audit-events` | all services | audit-log consumer (writes to append-only store) | actorId | 1y (compliance) |

All schemas registered in **Confluent Schema Registry** (Avro), with **BACKWARD** compatibility
mode enforced so consumers never break on producer schema evolution.

**Example event — `anomaly-detected` (Avro-described as JSON):**
```json
{
  "eventId": "b3a1...uuid",
  "timestamp": "2026-07-30T12:45:00Z",
  "serviceId": "payment-v2",
  "cluster": "prod-us",
  "anomalyScore": 0.92,
  "affectedMetrics": ["latency_p95", "error_rate"],
  "traceId": "abc123"
}
```

Exactly-once semantics achieved via Kafka idempotent producers (`enable.idempotence=true`) +
transactional writes where a consumer both reads and produces (e.g. Orchestrator consuming
`anomaly-detected` and producing `incident-created` in one transaction).

**Dead Letter Queue:** all consumers write deserialization or processing failures to `dlq-events`
topic; a DLQ reconciler service periodically retries failed messages with exponential backoff and
alerts if a message exceeds max retry count.

**Additional topics:**

| Topic | Producer | Consumer(s) | Key | Retention |
|---|---|---|---|---|
| `raw-logs` | Go Collector | Elasticsearch sink | serviceId | 7d |
| `raw-traces` | Go Collector | Jaeger collector | traceId | 7d |
| `alert-triggered` | Orchestrator | Notification Engine | ruleId | 7d |
| `notification-sent` | Notification Engine | Audit Logger | userId | 30d |
| `maintenance-window-started` / `maintenance-window-ended` | Orchestrator | Alert Suppression Engine | serviceId | 30d |
| `model-retrained` | Python Model Trainer | Orchestrator, MLflow | modelName | 7d |
| `feedback-received` | Frontend/API | ML Retrainer | userId | 30d |
| `user-activity` | All services | Audit Logger | actorId | 90d |
| `config-changed` | Orchestrator | All services (cache invalidation) | configKey | 7d |
| `status-page-updated` | Orchestrator | Status Page Publisher, Node.js | componentId | 7d |
| `dlq-events` | Any consumer | DLQ Reconciler | topic-partition | 14d |
| `incident-merged` | Orchestrator | Node.js, Audit | targetIncidentId | 30d |

All new topics follow the same Schema Registry (Avro) with BACKWARD compatibility and exactly-once
producer semantics.

---

## 7. Authentication & Authorization (Deep)

### 7.1 Authentication Flow

**Primary auth:** OAuth2 + OIDC via Keycloak.

**Token model:**
- Access token: JWT, RS256-signed, 15 min expiry, claims include `sub`, `roles`, `teamId`, `permissions`.
- Refresh token: opaque, stored hashed in `user_sessions` table, 7-day expiry, **single-use** — using
  a refresh token invalidates it and issues a new one; reuse of an already-used refresh token
  immediately revokes the entire token family (protects against stolen-refresh-token replay).

**Registration flow:** `POST /auth/register` → sends verification email → user clicks link →
`POST /auth/verify-email` → account activated. Unverified accounts can't access any
service-scoped resources, only profile management.

**Invitation flow:** TeamOwner/Admin → `POST /auth/invite` → email with token → recipient →
`POST /auth/accept-invite` → account created (if new) → added to team. Invitations expire in 7 days.

**Password management:**
- Forgot password: `POST /auth/forgot-password` → email with reset link (1h expiry, single-use).
- Password history: last 5 passwords tracked; reuse blocked.
- Password policy: min 12 chars, must include uppercase, lowercase, digit, special char.
- Account lockout: 5 failed attempts → 15 min lock for that account; 10 failed attempts → manual
  admin unlock required. Lockout is per-account, not per-IP (prevents DoS against specific users).

**MFA:** TOTP (RFC 6238) via authenticator apps.
- Enrollment: `POST /auth/mfa/setup` returns secret + QR code + 10 single-use backup codes.
- Verification: `POST /auth/mfa/verify` with current TOTP to confirm setup.
- Recovery: if device lost, backup codes can be used exactly once each.
- Enforcement: MFA required for `PlatformAdmin` and `SRE` roles for any destructive action
  (approve healing, trigger rollback, delete resources). Optional for other roles.
- Trusted devices: browser cookie marks device as trusted for 30 days, skipping MFA prompt.

**Session management:**
- All active sessions tracked in `user_sessions` table.
- User can view all sessions (`GET /auth/sessions`) and terminate specific ones.
- Login history stored in `login_attempts` for audit and suspicious-activity detection.
- Concurrent session limit: max 10 active sessions per user; oldest session revoked on excess.

### 7.2 API Keys & Service Accounts

For machine-to-machine auth (scripts, CI/CD, external integrations) instead of user JWTs:

- **API keys:** long-lived (configurable expiry, max 1 year), key prefix stored in plaintext for
  identification, key hash stored for validation. Scopes limit access (e.g. `metrics:read`,
  `incidents:write`). Keys can be revoked immediately.
- **Service accounts:** special JWT tokens issued for automated processes, tied to a service
  identity rather than a user. Used by internal services for cross-service calls where mTLS is
  impractical.

### 7.3 Authorization Model

**Roles (RBAC):**
| Role | Scope | Privileges |
|---|---|---|
| PlatformAdmin | Global (all orgs) | Everything: manage users, billing, system config, all teams |
| OrganizationOwner | Org-level | Manage org settings, members, billing |
| TeamOwner | Team-level | Manage team members, roles, services within team |
| SRE | Team-level | Heal/approve actions, view/modify incidents within team |
| Viewer | Team-level | Read-only: dashboards, incidents, metrics |

**Fine-grained permissions (ABAC):**
Permission strings like `service:payment-v2:heal` checked via Spring `@PreAuthorize` with custom
`PermissionEvaluator`. Permission checks include:
- Team membership (is user in the service's team?)
- Role-based permission (does user's role grant this action?)
- Resource-level restrictions (can user only heal low-risk services?)

**Dynamic roles (extended):**
Custom roles can be created with arbitrary permission combinations via `POST /api/v1/roles`.
Built-in roles are immutable; custom roles are org-scoped.

### 7.4 mTLS & Service Mesh

- **mTLS** between all internal services (agent→collector, orchestrator→analyzer, orchestrator→k8s).
- Certs issued and rotated by **Vault PKI secrets engine** (short-lived: 24h certs).
- Auto-renewal via sidecar (Vault Agent) or init container.
- **Audit:** every authorization decision (pass or fail) that touches a mutating endpoint is written
  to `audit_log` synchronously — a failed-write never silently drops an audit record.

---

## 8. Auto-Healing Engine — Full Decision Logic

**Trigger → Decision → Execution → Validation → Rollback**, expanded:

**1. Trigger.** `anomaly-detected` consumed by Orchestrator. Incident created or matched to
existing open incident for the same service (dedup window: 10 min).

**2. Root cause request.** Synchronous call to Python `/v1/anomaly/root-cause` with a 3s timeout;
on timeout/failure, Orchestrator proceeds with rule-based healing only (ML-suggested actions are
skipped, not blocking).

**3. Risk scoring** (0–100), computed as:
```
risk = w1 * blast_radius       // how many downstream services depend on this one
     + w2 * action_reversibility_inverse  // e.g. pod restart=low, db failover=high
     + w3 * (1 - historical_success_rate) // has this action worked before for this service?
     + w4 * business_hours_multiplier     // riskier to act during peak traffic
```
Weights (`w1..w4`) are configurable per-team, defaulted from historical incident outcomes.

**4. Decision:**
- risk `< 40` → auto-apply immediately
- risk `40–75` → Slack/email notification to on-call, 5-min approval timeout, auto-applies if no
  response **only if** the rule is flagged `autoApplyOnTimeout: true` (off by default for
  anything touching a database)
- risk `> 75` → mandatory human approval, no timeout auto-apply

**5. Execution (Temporal workflow):**
```
Step 1: snapshot current metrics (before state)
Step 2: execute action via K8s API (through the Go-client adapter)
Step 3: wait 5–15 min (configurable per action type)
Step 4: re-fetch metrics, compare against before-state + against the anomaly threshold
Step 5a: if improved → mark COMPLETED
Step 5b: if not improved → ROLLBACK (restore previous state) → mark FAILED → escalate to human
```

**6. Safety mechanisms:**
- Max 3 automated healing attempts per incident; 4th+ requires human action.
- Global cool-down: same action type on same service can't re-trigger within N minutes.
- **Kill switch**: a single admin-toggleable flag (`healing.enabled=false`) that, checked at the
  very top of `HealingOrchestrationService.handleAnomaly()`, disables all auto-healing instantly
  across the whole platform — this is the first thing to build, not an afterthought.
- **Dry-run mode:** every `AutoHealingRule` has a `dryRun: true` flag. In dry-run mode, the full
  decision pipeline runs (trigger, risk-scoring, approval), but the execution step logs what *would*
  have happened instead of acting. All dry-run executions are recorded in a separate
  `healing_actions (status=DRY_RUN)` with the simulated before/after metrics. This is the trust
  builder — run rules in dry-run for 7 days before enabling live execution.
- **Manual abort:** any in-flight Temporal workflow can be aborted via
  `POST /healing/{actionId}/cancel` which sends a cancellation signal to the workflow (Temporal
  supports cooperative cancellation). The workflow runs its rollback logic if already past "point
  of no return" (configured per action type).

**7. Custom action types (extensibility):**
Beyond built-in K8s actions, the healing engine supports pluggable action handlers:
- **Webhook action:** `POST`/`PUT` to an arbitrary URL with a signed payload. Response expected
  within a configurable timeout. Rollback is implemented as a separate rollback webhook.
- **Ansible/SSH action:** executes a predefined playbook on a target host via Ansible Tower/AWX.
  Used for OS-level remediation (disk cleanup, service restart, config file fix).
- **Script action:** runs a containerized script (Docker image + env vars + timeout) in the
  cluster. The script's exit code determines success/failure; stdout/stderr captured for audit.
- **Feature flag toggle:** toggles a feature flag (via OpenFeature or LaunchDarkly API) to
  disable a problematic feature without redeploying.
- **Traffic shift:** adjusts Istio virtual service weights to drain traffic from a problematic
  subset.

Each custom action type requires:
1. A handler implementation registered in the Orchestrator
2. Pre-execution safety checks defined in the action template
3. A rollback strategy (or explicit "no rollback possible" declaration for non-reversible actions)

---

## 9. Anomaly Detection — Full Algorithm

**Pipeline per detection request:**

1. **Feature engineering** — rolling window aggregates (1/5/15 min): mean, std, p50/p95/p99,
   rate-of-change (first derivative), cross-metric ratios (e.g. latency/throughput), and
   time-of-day/day-of-week one-hot features for seasonality.

2. **Layer 1 — Statistical (always runs, cheap):** EWMA + adaptive Z-score. Threshold is not
   fixed — it's recalculated from a trailing 14-day baseline **per hour-of-day/day-of-week
   bucket**, so a "normal" Monday-9am latency isn't flagged just because it's higher than
   Sunday-3am latency.

3. **Layer 2 — Isolation Forest (runs if Layer 1 borderline, e.g. score 0.4–0.7):** trained
   offline on the last 30 days of "known normal" data (periods with no confirmed incidents),
   retrained daily via a Celery periodic task.

4. **Layer 3 — LSTM Autoencoder (runs only for services flagged high-priority, or on-demand):**
   sequence length 60–120 timesteps, multivariate input (CPU, memory, latency, error rate,
   business KPI if available). Reconstruction error above a percentile threshold = anomaly.
   This is the most expensive layer — it is deliberately gated so it doesn't run on every metric
   point for every service.

5. **Ensemble score:**
```python
final_score = (
    0.25 * statistical_score +
    0.30 * isolation_score +
    0.35 * deep_learning_score +   # 0 if layer 3 skipped, weights renormalized
    0.10 * causal_confidence
)
```

6. **Layer 4 — Causal analysis (only if final_score > threshold):** Granger causality test across
   the set of metrics that deviated in the same window, to rank *which metric moved first* —
   this is what turns "5 things look weird" into "error_rate spiked 45s after latency_p95, so
   latency is the likely root cause, not the effect."

7. **Prediction:** Prophet (seasonal decomposition) + LSTM forecast blended for a 30–60 min
   horizon, only computed if an anomaly was actually found (not run continuously for every
   service — that would be wasteful).

8. **Model lifecycle:** all models versioned in MLflow. Daily retrain job evaluates the new model
   against a held-out validation set; only promotes it to production if validation metrics
   (precision/recall on labeled historical incidents) improve — otherwise keeps serving the
   previous version. New models run in **shadow mode** (scoring in parallel, not affecting
   decisions) for 3 days before promotion.

9. **Feedback loop (human-in-the-loop):** every anomaly detection result can be labeled by an SRE
   via `POST /v1/anomaly/{id}/feedback` with fields: `{isTruePositive, actualSeverity, notes}`.
   This feedback is:
   - Stored in a `anomaly_feedback` table and used as ground truth for retraining.
   - Weighted higher than unlabeled data in the retrain loss function (10x weight).
   - Used to compute per-model precision/recall trends visible in `GET /v1/models/status`.
   - Periodically analyzed to detect concept drift — if precision drops below 70% for 3 consecutive
     days, the model auto-rolls back to the previous version and triggers an alert.

10. **Model explainability:** every anomaly response includes a `contributions` field with
    SHAP-like feature importance values showing which input metrics contributed most to the
    anomaly score. This turns "your latency is anomalous" into "latency_p95 contributed 62%,
    error_rate contributed 28%, CPU contributed 10%".

---

## 10. Frontend Architecture

**Stack:** React 19 + TypeScript, Vite, TanStack Query v5 (server state), Zustand (light UI
state), Redux Toolkit (only for the Incident Command Center's complex multi-panel state),
Tailwind + shadcn/ui, Recharts + React Flow (topology graphs).

**Folder structure:**
```
frontend/src/
├── app/                # routes, layout, providers
├── features/           # feature-sliced: dashboard/, incidents/, healing/, slo/, auth/
│   └── incidents/
│       ├── api/         # TanStack Query hooks (useIncidentQuery, useHealingMutation)
│       ├── components/
│       └── store/       # feature-local Zustand/Redux slice
├── components/common/   # Button, Modal, Table, etc.
├── hooks/                # useWebSocket, useAuth, usePermission
├── lib/                  # axios instance + interceptors, formatters
└── types/
```

**Real-time data flow:**
`useWebSocket` hook opens a single Socket.io connection app-wide (via context), subscribes to
`dashboard:subscribe` on mount. Incoming events are pushed into the TanStack Query cache directly
via `queryClient.setQueryData(...)` rather than triggering a refetch — this gives instant UI
updates without an extra round-trip, while TanStack Query still handles staleness/refetch-on-focus
for the initial load and reconnection gaps.

**Auth flow:** Axios request interceptor attaches the access token; response interceptor catches
`401`, attempts a silent refresh (once, with a mutex so concurrent 401s don't fire 5 refresh calls
simultaneously), retries the original request, and force-logs-out only if refresh itself fails.

**Key pages:**
- **Live Overview** — service health grid (color-coded by SLO burn rate), virtualized (TanStack
  Virtual) for 100+ services without lag.
- **Topology Graph** — React Flow, nodes = services, edges = observed traffic (from traces),
  color = current health; click a node to open its metrics panel inline.
- **Incident Command Center** — timeline (event-sourced from `incident_events`), root cause
  panel, one-click "apply suggested healing" with the risk score shown prominently before the
  user confirms (never auto-hide risk level). Includes incident war room view with ChatOps
  integration, merge/link controls, and postmortem generator.
- **SLO Dashboard** — error budget burn-rate chart, color thresholds at 2x/4x/8x burn rate
  (standard Google SRE workbook alerting windows).
- **Custom Dashboard Builder** — drag-and-drop widget placement, save/share/export dashboards,
  template variables (`$service`, `$cluster` dropdowns), JSON import/export.
- **Alerting & Notification Center** — visual alert rule builder, notification channel config,
  maintenance window management, on-call schedule viewer.
- **Status Page** — live component status, incident history, uptime percentiles, maintenance
  calendar, subscriber management.
- **Service Catalog** — inventory view with ownership, tier, health scorecards, dependency graph.
- **Log Explorer** — Lucene/KQL-style search, saved queries, field extraction, live tail, context
  around log lines, export.
- **Trace Explorer** — waterfall/flame graph visualization, trace search by service/duration/error,
  trace-to-log correlation via traceId injection.
- **Synthetic Monitoring** — check configuration, result history, global probe map, alert
  thresholds.
- **Global Search (Cmd+K)** — instant search across services, incidents, logs, runbooks, and
  dashboards with keyboard navigation and recent searches.
- **Admin Panel** — system settings, feature flags, user management, audit log viewer with
  filters/export, data retention configuration, license management.

**Enhanced UX features:**
- **Dark/Light theme** toggle persisted in user preferences.
- **Keyboard shortcuts** — `g i` → incidents, `g d` → dashboard, `a` → approve healing, `r` → rollback.
- **Timezone switcher** — UTC vs local time, stored in user preferences.
- **In-app notification inbox** — bell icon with read/unread count, notification history, click
  to navigate to related resource.
- **Onboarding wizard** — guided first-run experience for new users (connect first service, set up
  notification channels, invite team members).
- **PWA support** — installable as app, offline-capable for critical views.

---

## 11. Security & Observability

- **Zero-trust internal networking:** every service-to-service call over mTLS, no implicit trust
  based on network location (e.g. "it's inside the VPC so it's fine" is explicitly rejected).
- **Secrets:** all credentials/API keys in Vault, injected via sidecar or CSI driver — never in
  env vars baked into images.
- **Dependency scanning:** Trivy in CI, blocks merge on critical CVEs.
- **Self-monitoring ("dogfooding"):** AstraWatch's own services emit Prometheus metrics and are
  monitored by... AstraWatch itself in a separate "meta" cluster/namespace, so an outage in the
  monitored fleet doesn't take down your ability to see that outage. 100% trace sampling on
  AstraWatch's own internal calls (not on customer traffic — that would be prohibitively
  expensive at scale, hence adaptive sampling in section 3.1).

---

## 12. Deployment & CI/CD

- **GitOps via ArgoCD:** Git is the source of truth for desired cluster state; ArgoCD reconciles.
- **Progressive delivery:** canary releases via Argo Rollouts + Istio traffic splitting — new
  version gets 5% traffic, auto-promoted if error rate/latency stay within bounds for 10 min,
  auto-rolled-back otherwise (this is essentially the same pattern as the healing engine, applied
  to AstraWatch's own deployments).
- **CI pipeline (GitHub Actions):** lint → unit test → build → Trivy scan → push image → update
  Helm values in a separate GitOps repo (triggering ArgoCD sync).
- **Infra as code:** Terraform for cloud resources (VPC, managed Kafka/DB if not self-hosted),
  Helm charts per service for k8s manifests.

---

## 13. Phased Build Roadmap — Current Status

Each phase is independently useful and demoable.

### Phase 1 ✅ (Complete) — Core ingestion + basic detection
- Go Collector (ingest + simple query API) + ClickHouse + basic Python statistical anomaly detector (Layer 1)
- Minimal React dashboard showing live metrics; direct HTTP (no Kafka yet)
- Basic auth (login/register/refresh with JWT)
- Service catalog auto-discovery from K8s

### Phase 2 ✅ (Complete) — Event-driven backbone
- Kafka introduced; Collector→Analyzer communication moved to async events
- Java Orchestrator with incident creation (detect-and-record)
- WebSocket real-time push for incident updates
- Basic notification channels (Slack webhook + email via SMTP)
- Producer/Consumer lifecycle managed through environment variables and health checks
- Dashboard: metrics dashboard, anomaly timeline, services view, status badges

### Phase 3 (Target: Q3 2026) — Auto-healing v1
- Risk scoring, manual-approval healing actions (start with "restart pod" + "scale deployment" — 2 types, not 6)
- Dry-run mode
- Runbook v1 (basic execution)
- On-call schedules and escalation policies
- Alert deduplication and grouping
- Maintenance windows

### Phase 4 (Target: Q4 2026) — ML depth + K8s native + noise reduction
- Isolation Forest + causal analysis
- Kubernetes Operator with `AutoHealingRule` CRD
- ML feedback loop (true/false positive labeling)
- Threshold auto-tuning
- Alert storm prevention
- Postmortem creation + action item tracking

### Phase 5 (Target: Q1 2027) — Production-grade polish
- Auth/authz (Keycloak, RBAC, MFA, API keys, sessions)
- Temporal workflows
- SLO tracking (burn rate alerting)
- Self-monitoring (meta-cluster), Status page
- Synthetic monitoring (HTTP/TCP checks)
- Custom dashboard builder, Audit log viewer

### Phase 6 (Target: Q2 2027) — Enterprise & advanced features
- Multi-tenancy (row-level security, quotas)
- OpenTelemetry compliance (OTel Collector pipelines)
- Feature flags & config management
- Terraform provider, CLI tool
- Compliance (GDPR, SOC 2 design)
- Cost management & data tiering
- Advanced MCP server for AI agent integration
- Outgoing webhooks for Jira/ServiceNow

### Phase 7 (Ongoing / stretch) — C++ agent, LSTM, chaos, multi-cluster, AI copilot
- Chaos experiments with automated guardrails
- LSTM autoencoder
- C++ eBPF agent
- Multi-region active-active DR
- Natural language AI assistant for incident analysis
- Browser-based synthetic monitoring, Real user monitoring (RUM)

### Current Focus: Phase 2.5 — Telemetry Architecture Decision

Before beginning Phase 3, we are resolving a cross-cutting architectural question:

> **How should telemetry data flow from Go Collector → ClickHouse → services?**

We need telemetry for two use cases:
1. **Incident correlation** — the Orchestrator and Analyzer need to query recent metric/latency/error data when evaluating incidents
2. **Dashboards** — the frontend needs to render live and historical charts

**Option A — Collector writes to ClickHouse, services query ClickHouse directly**
- Pro: simple, single source of truth
- Con: couples all readers to ClickHouse schema; high read load on ClickHouse

**Option B — Collector writes to ClickHouse + maintains an in-memory ring buffer, services query a thin Go query API on the Collector**
- Pro: decouples readers from ClickHouse; low-latency reads for recent data
- Con: Collector becomes stateful; two code paths per metric

**Option C — Collector publishes enriched metrics to a Kafka topic, a dedicated "Telemetry Consumer" service writes to ClickHouse, services query the Consumer's gRPC API**
- Pro: fully decoupled; Kafka as durable buffer; Consumer owns schema + can aggregate
- Con: most moving parts; higher latency from ingestion to query

Decision expected before Phase 3 begins.

---

## 14. Alert Fatigue & Noise Reduction

### 14.1 Problem Statement

A single infrastructure failure can generate hundreds of raw alerts (each metric threshold breach,
each log error pattern, each dependent service anomaly). Without noise reduction, SREs suffer alert
fatigue — treating all alerts as suggestions rather than mandates, which causes critical signals to
be missed.

### 14.2 Alert Lifecycle

```
Raw Alert → Deduplication → Correlation → Enrichment → Grouping → Incident
                │               │
                ▼               ▼
           (duplicate)     (maintenance window suppress)
```

### 14.3 Deduplication Strategy

| Level | Method | Window | Action |
|---|---|---|---|
| Exact match | Same metric + service + value | 5 min | Suppress, increment count on parent |
| Similarity match | Same metric + service, value within 5% | 5 min | Suppress, update parent value range |
| Flapping detection | Same metric oscillates above/below threshold 3+ times in 10 min | 10 min | Suppress, mark as flapping, escalate differently |
| Maintenance window | Any alert from service during active window | Until window end | Silently discard (logged to audit) |

### 14.4 Alert Correlation (Topology-Aware)

When an anomaly fires, the Orchestrator queries the service dependency graph to determine if this
alert is a root cause or a downstream symptom:

- **Root cause alert:** the affected service has no upstream dependencies also alerting → create new incident.
- **Symptom alert:** at least one upstream dependency is also alerting → group into the upstream's incident.
- **Cascade detection:** if 3+ services in a dependency chain alert within 2 min → create single
  incident, mark highest-severity service as root cause candidate.

### 14.5 Alert Grouping

Groups of correlated alerts are merged into a single incident with:
- One root cause candidate (highest confidence from causal analysis)
- Aggregated timeline (all events sorted, with duplicates collapsed)
- Combined severity (max of all grouped alerts)
- Automatic notification suppression (only one notification per group)

### 14.6 Threshold Adaptation

Static thresholds cause noise. AstraWatch uses:
- **Dynamic baselines:** thresholds are recalculated from trailing 14-day data per hour-of-day /
  day-of-week bucket (see Section 9, Layer 1).
- **Auto-tuning:** if a threshold fires 10+ times in a day with < 30% true positive rate (from
  feedback loop), the threshold is automatically widened by 1 standard deviation.
- **Seasonal awareness:** known seasonal patterns (e.g. Black Friday traffic) are flagged as
  "expected high load" via calendar annotations, suppressing threshold alerts during those periods.

### 14.7 Alert Storm Prevention

- **Global rate cap:** max 100 alerts per minute per service; excess is sampled (log every Nth),
  not dropped entirely.
- **Incident flood gate:** if 5+ incidents are created within 10 min for the same service, new
  alerts are routed to a "hold queue" reviewed by an SRE before creating more incidents.
- **Cooldown:** once an incident is created for a service, new alerts for the same metric are
  suppressed for N minutes (configurable per service, default 15 min).

---

## 15. Runbook Automation & Knowledge Management

### 15.1 Concept

A runbook is a versioned, structured recipe for diagnosing and resolving a specific type of incident.
Runbooks bridge the gap between "anomaly detected" and "action executed" — they encode SRE knowledge
as code, ensuring consistent response regardless of which engineer is on call.

### 15.2 Runbook Structure

```yaml
version: "1"
title: "Payment Service High Latency Recovery"
service: payment-v2
tags: [latency, payment, database]
trigger:
  metrics: [latency_p95, error_rate]
  conditions:
    - latency_p95 > 500ms for 3m
steps:
  - id: step-1
    name: "Verify database connection pool"
    command: "kubectl exec payment-v2-{pod} -- curl localhost:8080/health/db"
    expectedOutput: "{\"pool\": {\"active\": 25, \"idle\": 75, \"max\": 100}}"
    timeout: 10s
    onFailure: "skip-to-step-3"
  - id: step-2
    name: "Kill long-running queries"
    command: "kubectl exec payment-v2-{pod} -- kill-long-queries --timeout 30s"
    rollback: "" # no rollback needed for query kill
  - id: step-3
    name: "Restart payment service pods"
    command: "kubectl rollout restart deployment/payment-v2"
    waitForStable: 120s
    rollback: "" # can't rollback a restart
    riskLevel: Medium
validation:
  - metric: latency_p95
    operator: LessThan
    threshold: 200
    forDuration: 60s
```

### 15.3 Runbook Execution Engine

- Runs as a Temporal workflow (same infra as healing workflows).
- Each step executes sequentially; on failure, follows `onFailure` directive (skip, retry, abort).
- Every step is logged with input/output/duration to the incident timeline.
- Rollback steps execute in reverse order if the main steps fail and the runbook declares rollbacks.
- Runbooks can be triggered:
  - Automatically (matched to anomaly type by `trigger` rules)
  - Manually (SRE invokes from incident command center)
  - From ChatOps (`/astrawatch runbook execute payment-latency`)

### 15.4 Knowledge Base & RAG Integration

Runbooks, incident postmortems, and historical RCA documents are indexed into an Elasticsearch
knowledge base (`sre-knowledge-base` index) with semantic text fields. When an anomaly fires:

1. The anomaly's signature (service + affected metrics + error patterns) is used as a semantic
   search query against the knowledge base.
2. Top-3 matching runbooks/documents are retrieved with relevance scores.
3. For high-confidence matches (score > 0.85), the corresponding runbook is suggested as the
   primary healing action.
4. For medium-confidence matches (0.60–0.85), runbooks are listed as "recommended reading" in the
   incident timeline.
5. All matches are attached to the incident for SRE context.

### 15.5 Runbook Lifecycle

- **Draft:** under development, not executable.
- **Published:** available for automatic/manual execution.
- **Deprecated:** replaced by a newer version; still executable but produces a warning.
- **Archived:** no longer executable; kept for historical reference.

---

## 16. On-Call Management & Escalation

### 16.1 On-Call Schedules

Schedules define who is responsible for incident response at any given time:

| Rotation Type | Description |
|---|---|
| Weekly | Primary on-call rotates every Monday at 0900 local time |
| Daily | Daily rotation (useful for follow-the-sun) |
| Custom | Arbitrary start/end times per entry |
| Follow-the-sun | 3 shifts: AMER (0800-1800 ET), EMEA (0800-1800 CET), APAC (0800-1800 AEST) |

Each schedule entry has a role: `PRIMARY` (first responder), `SECONDARY` (backup), `ESCALATION`
(manager/lead).

Schedules integrate with Google Calendar / Outlook via iCal export for visibility.

### 16.2 Escalation Policies

```yaml
name: "Standard SRE Escalation"
rules:
  - escalateAfterSeconds: 300
    target: PRIMARY
    action: NOTIFY # Slack + PagerDuty notify current on-call
  - escalateAfterSeconds: 600
    target: SECONDARY
    action: ESCALATE # Escalate to secondary, notify primary they've been escalated past
  - escalateAfterSeconds: 900
    target: ESCALATION
    action: PAGE # Phone call + high-urgency notification
  - escalateAfterSeconds: 1800
    target: ENGINEERING_MANAGER
    action: ESCALATE_WITH_REPORT # Escalate with full incident summary
```

Escalation is a distinct step in the incident state machine: an unacknowledged incident moves
through escalation levels automatically. Acknowledge (`POST /incidents/{id}/acknowledge`) stops
the escalation timer.

### 16.3 Notification Channels

| Channel | Use Case | Reliability | Cost |
|---|---|---|---|
| Slack / Teams | Low/Medium severity alerts | Medium (best-effort delivery) | Free |
| Email | Reports, digests, low-severity | Low (can be missed) | Free |
| PagerDuty / Opsgenie | Critical incidents, on-call routing | High (escalation + phone) | Paid |
| SMS | Critical acknowledgments | High | Per-message |
| Voice / Phone call | P1 incidents, no-ack after 10 min | Very high | Per-minute |
| Webhook | Custom integrations | Medium | Free |

Every notification channel can be tested via `POST /channels/{id}/test` which sends a synthetic
payload and reports delivery status.

### 16.4 Follow-the-Sun & Handoff

- Shift handoff happens automatically at schedule boundaries.
- Before handoff, a summary of open incidents and their status is posted to the handoff Slack channel.
- Shadow on-call: secondary on-call follows along but isn't paged unless primary misses acknowledgment.

---

## 17. Synthetic & Proactive Monitoring

### 17.1 Rationale

AstraWatch's core detection is reactive — it requires the service to be emitting metrics/logs to
detect anomalies. Synthetic monitoring provides outside-in, black-box health checks that detect
issues before user-facing impact, even if the service has stopped emitting telemetry.

### 17.2 Check Types

| Type | What It Tests | Example |
|---|---|---|
| HTTP(S) | Endpoint availability, response time, status code, JSON body assertions | `GET /api/health` expects `200` and `{"status":"ok"}` within 500ms |
| TCP | Port reachability | `payment-v2:443` accepts TCP connections |
| DNS | Resolution correctness and latency | `api.astrawatch.io` resolves to expected A record |
| SSL/TLS | Certificate validity, days to expiry, chain completeness | `astrawatch.io` certificate expires in > 30 days |
| Browser (Playwright) | Full user flow simulation | Login → search → checkout flow completes in < 5s |
| ICMP Ping | Basic host reachability | `10.0.1.42` responds to ping |

### 17.3 Probe Infrastructure

- **Probe regions:** `us-east-1`, `eu-west-1`, `ap-southeast-1`, `sa-east-1` (configurable).
- Each region runs a lightweight Go probe service that executes checks and reports results.
- Checks run at configurable intervals (default: 5 min for HTTP/TCP, 60 min for SSL, 15 min for browser).
- Results are stored in `synthetic_check_results` table and exposed via the API.
- Alerting: if a check fails for 2 consecutive runs, an alert is created (bypasses the anomaly
  pipeline — synthetic failures are immediate signals).

### 17.4 Multi-Region Alerting

- A single-region failure may indicate a local network issue, not a service outage.
- Alert only if 2+ regions report failure (configurable threshold per check).
- Region-specific check results are visible in the dashboard for debugging.

---

## 18. Status Page

### 18.1 Purpose

The status page provides external stakeholders (customers, partners, internal teams) with real-time
visibility into system health. It is a separate public-facing surface that does not require
authentication.

### 18.2 Components

The status page displays:
- **Component list:** API, Database, CDN, etc. Each with current status indicator.
- **Incident history:** resolved and ongoing incidents with timeline and updates.
- **Uptime percentiles:** 7-day, 30-day, 90-day uptime per component.
- **Scheduled maintenance:** upcoming and ongoing maintenance windows with countdown.

### 18.3 Status Values

| Status | Description | Color |
|---|---|---|
| OPERATIONAL | Component is healthy | Green |
| DEGRADED | Performance degradation but still serving | Yellow |
| PARTIAL_OUTAGE | Some functionality unavailable | Orange |
| MAJOR_OUTAGE | Complete service disruption | Red |
| MAINTENANCE | Scheduled maintenance in progress | Blue |

### 18.4 Subscriber Notifications

- Subscribers can opt in via email, SMS, or webhook.
- On incident creation/update, subscribers receive a notification with severity and expected resolution.
- Scheduled maintenance is announced 24h in advance for critical components.
- Subscriber preferences managed via `POST /status-page/subscribers`.

### 18.5 Status as Code

Status page components and their service mappings can be managed via Terraform provider, allowing
status page configuration to be version-controlled alongside infrastructure.

---

## 19. AI Agent Integration & MCP

### 19.1 Model Context Protocol (MCP) Server

AstraWatch implements an MCP server that exposes observability signals as tools consumable by
AI agents (Claude, Copilot, custom agents):

```yaml
# MCP Tool Definitions
tools:
  - name: "query_metrics"
    description: "Query historical metrics for a service"
    parameters:
      serviceId: string
      metricName: string
      from: timestamp
      to: timestamp
      aggregation: "avg|p95|max|min"

  - name: "get_incident_context"
    description: "Get full incident context including timeline, metrics, and runbooks"
    parameters:
      incidentId: string

  - name: "search_runbooks"
    description: "Search runbooks by service or error pattern"
    parameters:
      query: string
      serviceId: string?

  - name: "execute_runbook"
    description: "Execute a runbook (requires human approval for risk > 40)"
    parameters:
      runbookId: string
      parameters: object

  - name: "analyze_anomaly"
    description: "Run root cause analysis on current metric patterns"
    parameters:
      serviceId: string
      metrics: array

  - name: "get_topology"
    description: "Get service dependency graph"
    parameters:
      serviceId: string?
```

### 19.2 AI Assistant Capabilities

- **Natural language querying:** "Why did payment service spike at 2 AM?" → MCP query →
  metric analysis + runbook search + incident history → plain-English explanation.
- **Incident summarization:** AI generates a concise summary of an incident's timeline, root cause,
  and resolution for handoff or postmortem.
- **Dashboard generation:** "Create a dashboard showing all payment service metrics for the last 7
  days" → AI selects relevant metrics and generates a dashboard configuration.
- **Alert tuning suggestions:** "This CPU alert keeps firing for no reason" → AI analyzes feedback
  history and suggests threshold adjustments.

### 19.3 Agent Safety

- All AI actions are logged to the audit trail with full input/output.
- Mutating actions (runbook execution, healing approval) require explicit human confirmation for
  risk > 40 (same threshold as auto-healing).
- Read-only queries (metrics, topology, incidents) are allowed without approval.
- The MCP server enforces the same RBAC/ABAC permissions as the REST API.

---

## 20. Multi-Tenancy & Data Isolation

### 20.1 Organizational Model

```
Organization
  ├── Teams
  │    ├── Services
  │    ├── Users (with roles)
  │    └── Notification Channels
  ├── Billing Plan
  └── Settings
```

- An **Organization** is the top-level tenant boundary. Each org has its own data isolation scope.
- A **Team** is a logical group within an org. Teams own services and have their own members and roles.
- Users can belong to multiple teams within the same org.

### 20.2 Data Isolation Strategy

| Data Store | Isolation Model | Notes |
|---|---|---|
| PostgreSQL | Row-level security (`org_id` on all tables) | All queries filter by `org_id` via Spring Security tenant filter |
| ClickHouse | Database-per-tenant (`astrawatch_tenant_{id}`) | Queries use tenant-specific database name |
| Elasticsearch | Index-per-tenant (`logs-{tenantId}-{service}-{date}`) | ILM policies isolated per index set |
| Kafka | Topic-per-tenant (`raw-metrics-{tenantId}`) | Separate partitions per tenant prevents cross-tenant impact |
| Redis | Namespace prefix (`astrawatch:{tenantId}:*`) | Key prefix ensures no collisions |

### 20.3 Resource Quotas

Each tenant has configurable limits enforced at the ingestion layer:

| Resource | Default Quota | Enforcement |
|---|---|---|
| Metrics ingest rate | 100k data points/min | HTTP 429 with `Retry-After` |
| Log ingest rate | 10 GB/day | HTTP 429, excess queued with backpressure |
| Trace ingest rate | 1M spans/day | HTTP 429 |
| Storage retention | 30 days (metrics), 15 days (logs) | ClickHouse TTL + Elasticsearch ILM |
| Active users | Based on billing plan | Blocked at auth layer |
| API rate limit | 1000 req/min per API key | Token bucket (Redis-backed) |

### 20.4 Cross-Tenant Visibility

- By default, no tenant can see another tenant's data.
- PlatformAdmin role has a special "cross-tenant view" flag that allows reading from any tenant
  (for support/debugging). All cross-tenant reads are logged to the audit trail.
- Synthetic monitoring probes run in shared infrastructure but results are tagged with `org_id`.

---

## 21. Cost Management & Data Tiering

### 21.1 Storage Tiers

| Tier | Latency | Retention | Storage Medium | Cost/GB |
|---|---|---|---|---|
| Hot | Real-time | 7 days | ClickHouse (SSD), Elasticsearch (hot nodes) | $$$ |
| Warm | < 5s queries | 7–30 days | ClickHouse (HDD), Elasticsearch (warm nodes) | $$ |
| Cold | < 60s queries | 30–90 days | ClickHouse with tiered storage, Elasticsearch frozen | $ |
| Archive | On-demand restore | 90 days – 1 year | S3/GCS/Blob Storage (Parquet/JSON) | $ |

### 21.2 Downsampling Strategy

```sql
-- Raw metrics (hot, 7 days)
CREATE TABLE metrics (
    service_id String, cluster String, metric_name String,
    ts DateTime64(3), value Float64, labels Map(String, String)
) ENGINE = MergeTree() PARTITION BY toYYYYMMDD(ts)
  ORDER BY (service_id, metric_name, ts) TTL now() + INTERVAL 7 DAY;

-- 5m rollup (warm, 30 days)
CREATE MATERIALIZED VIEW metrics_5m
ENGINE = AggregatingMergeTree() PARTITION BY toYYYYMMDD(ts)
ORDER BY (service_id, metric_name, ts)
AS SELECT service_id, metric_name,
    toStartOfFiveMinutes(ts) AS ts,
    avgState(value) AS avg, maxState(value) AS max,
    minState(value) AS min, quantileState(0.95)(value) AS p95,
    countState(value) AS count
FROM metrics GROUP BY service_id, metric_name, ts;

-- 1h rollup (cold, 90 days)
CREATE MATERIALIZED VIEW metrics_1h
ENGINE = AggregatingMergeTree() PARTITION BY toYYYYMMDD(ts)
ORDER BY (service_id, metric_name, ts)
AS SELECT ... FROM metrics_5m GROUP BY ...;
```

### 21.3 Storage Budgets & Cost Attribution

- Each org/team has a storage budget tracked in `usage_records`.
- Cost attribution: `storage_cost = data_ingested_gb * storage_duration_days * cost_per_gb_per_day`.
- The cost breakdown is visible in the admin panel: "Team X uses 40% of total storage =
  $200/month."
- Alerts fire when a team exceeds 80% of its storage budget.

---

## 22. Configuration Management & Feature Flags

### 22.1 Centralized Configuration

AstraWatch uses a centralized configuration service (Spring Cloud Config backed by Git):

- All service configuration is version-controlled in a Git repository.
- Changes are applied without service restart via Spring Cloud Bus (Kafka-backed).
- Configuration is validated against JSON schemas before being accepted.
- Sensitive values reference Vault paths (`vault://secret/astrawatch/db-password`) rather than
  storing plaintext.

### 22.2 Feature Flags

Feature flags use the OpenFeature standard with a custom REST API + Redis backend:

```yaml
flags:
  - name: "new-anomaly-detector-v2"
    description: "Rollout the LSTM autoencoder to all services"
    enabled: false
    targeting:
      - segment: "internal-team"
        percentage: 100
      - segment: "all"
        percentage: 5
```

Flags are evaluated at the service call boundary. Each service loads relevant flags from the
config service on startup and subscribes to real-time updates via Kafka `config-changed` topic.
This enables:

- Gradual rollout of new features (5% → 25% → 100%).
- Instant kill-switch for problematic features without deployment.
- A/B testing of algorithm changes.

---

## 23. Service Catalog & Dependency Management

### 23.1 Service Catalog

The service catalog is the central inventory of all services monitored by AstraWatch:

| Field | Description |
|---|---|
| `id` | UUID, auto-generated |
| `name` | Human-readable service name |
| `team_id` | Owning team |
| `tier` | CRITICAL, HIGH, MEDIUM, LOW |
| `cluster` | Kubernetes cluster name |
| `namespace` | K8s namespace |
| `owner` | Primary contact person |
| `docs_url` | Link to service documentation |
| `runbook_ids` | Associated runbooks |
| `health_score` | Composite score (0-100) from SLO attainment + error rate + latency |
| `lifecycle` | ACTIVE, DEPRECATED, ARCHIVED |

Services can be auto-discovered from Kubernetes API (all deployments in monitored namespaces) and
manually added for non-K8s services.

### 23.2 Dependency Graph

The dependency graph is built from:
1. **Trace data:** parent-child span relationships show which services call which.
2. **Kubernetes network policies:** indicate intended service-to-service communication.
3. **Manual annotations:** documented dependencies for external/legacy services.

The graph is stored as a directed acyclic graph (DAG) in PostgreSQL (`service_dependencies` table)
and exposed via:
- `GET /catalog/services/{id}/dependencies` — upstream and downstream lists.
- Topology graph in the frontend (React Flow).
- **Blast radius calculation:** when computing risk score, the Orchestrator traverses downstream
  dependencies to count affected services. A service with 10 downstream dependents has a higher
  blast radius than one with 0.

---

## 24. Compliance & Data Privacy

### 24.1 Data Classification

| Classification | Examples | Handling |
|---|---|---|
| Operational metrics | CPU, latency, error rates | Store as-is, TTL-based deletion |
| Structured logs | App logs, audit logs | Mask PII fields before indexing |
| Traces | Span metadata, service names | No personal data expected; sanitization pipeline runs anyway |
| User data | Emails, names, preferences | Encrypted at rest; full GDPR support |
| Secrets | API keys, passwords | Never in logs; Vault-based storage |

### 24.2 PII Detection & Masking

The Go Collector runs a configurable PII detection pipeline on log data before it reaches
Elasticsearch:

```yaml
pii_maskers:
  - pattern: '\b[\w\.-]+@[\w\.-]+\.\w+\b'  # email
    replacement: '***@***.***'
  - pattern: '\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b'  # credit card
    replacement: '****-****-****-****'
  - pattern: '\b\d{3}-\d{2}-\d{4}\b'  # SSN
    replacement: '***-**-****'
  - pattern: '(?i)(password|secret|token|key|credential)[=:]\s*\S+'  # credentials
    replacement: '$1=***REDACTED***'
```

Masking is applied per-field with white/blacklist support. Unmasked access is logged and restricted
to PlatformAdmin role.

### 24.3 Data Retention & Deletion

| Data Type | Production Retention | Compliance Retention (archive) | Deletion Method |
|---|---|---|---|
| Raw metrics | 90 days | 1 year (aggregated only) | ClickHouse TTL |
| Logs | 30 days | 1 year (PII-masked) | Elasticsearch ILM |
| Traces | 7 days | 30 days | Jaeger TTL |
| Audit logs | 1 year | 7 years (for regulated tenants) | Archive to S3, then delete |
| Incidents | Indefinite | Indefinite | N/A (anonymize on user deletion) |
| User data | Until account deletion | N/A | `DELETE` cascade + archive removal |

### 24.4 GDPR Compliance

- **Right to access:** `GET /auth/me/data-export` returns all personal data as JSON.
- **Right to erasure:** `DELETE /auth/me` triggers the data deletion workflow:
  1. Anonymize user references in incidents (replace user_id with `[deleted]`).
  2. Delete user row from `users` table.
  3. Delete all sessions, tokens, MFA codes, API keys.
  4. Archive incident timeline for compliance (anonymized).
  5. Send confirmation email.
- **Right to data portability:** all data exportable in JSON/CSV.

### 24.5 Compliance Certifications (Target)

| Certification | Scope | Target Timeline |
|---|---|---|
| SOC 2 Type II | Security, availability, confidentiality | Phase 5 |
| GDPR | Data privacy for EU users | Phase 5 (design ensures compliance from day 1) |
| HIPAA | Healthcare data (if needed) | Future phase |
| ISO 27001 | ISMS | Future phase |

---

## 25. Disaster Recovery & Business Continuity

### 25.1 Recovery Objectives

| Service | RTO (Recovery Time Objective) | RPO (Recovery Point Objective) |
|---|---|---|
| Go Collector | 5 min | 1 min |
| Python Analyzer | 10 min | 5 min (state reconstructed from Kafka) |
| Java Orchestrator | 5 min | 0 (Temporal persists state) |
| PostgreSQL | 15 min | 5 min (WAL streaming) |
| ClickHouse | 30 min | 15 min (S3 backups) |
| Elasticsearch | 30 min | 15 min (snapshot/restore) |
| Kafka | 15 min | 0 (rack-aware replicas, min.insync.replicas=2) |

### 25.2 Multi-Region Deployment

```
Region A (us-east-1)        Region B (us-west-2)
┌──────────────────┐        ┌──────────────────┐
│  AstraWatch       │  ←→   │  AstraWatch       │
│  Active-Active    │  Kafka│  Active-Active    │
│  (read + write)   │  Mirror│  (read + write)   │
└────────┬─────────┘        └────────┬─────────┘
         │                           │
         ▼                           ▼
   PostgreSQL WAL           PostgreSQL WAL
   → S3 continuous          → S3 continuous
```

- Both regions run active-active for read operations.
- Writes are routed to the primary region (Region A); Region B promotes to primary if Region A
  is unhealthy.
- Kafka MirrorMaker 2 replicates topics bidirectionally with aggregation enabled.
- Cross-region latency < 100ms for synchronous calls; async paths tolerate higher latency.

### 25.3 Backup Strategy

| Data Store | Backup Method | Frequency | Retention |
|---|---|---|---|
| PostgreSQL | pg_dump + WAL archiving to S3 | Continuous WAL, daily full | 30 days |
| ClickHouse | `BACKUP TABLE ... TO S3` | Every 6 hours | 14 days |
| Elasticsearch | Snapshot lifecycle policy to S3 | Every 6 hours | 14 days |
| Temporal | `temporal operator` export | Every hour | 7 days |
| Vault | Raft snapshot + S3 | Daily | 30 days |

### 25.4 Recovery Drills

- Automated recovery drills run monthly in a staging environment.
- Drill scenario: simulate Region A failure → verify Region B promotes → verify all data is
  accessible → simulate Region A recovery → verify data reconciliation.
- Drill results are published as an incident postmortem with action items.

---

## 26. SLO/SLI Deep Design

### 26.1 SLI Definition

Each SLO is built from one or more Service Level Indicators (SLIs):

| SLI Type | Definition | Measurement |
|---|---|---|
| Request latency | P95 response time < threshold | Measured from trace span durations |
| Error rate | % of requests returning 5xx | Count of 5xx / total requests × 100 |
| Availability | % of requests that complete successfully | (total - 5xx - timeouts) / total × 100 |
| Freshness | Time since last successful data pipeline run | Now - last_successful_run_timestamp |
| Throughput | Requests per second | Count over sliding window |

### 26.2 Error Budget Calculation

```
Error Budget = 1 - SLO Target
Example: 99.9% SLO → 0.1% error budget = 8.64 seconds of allowed downtime per 24h window
```

- Error budget is consumed by any SLI violation during the measurement window.
- Budget is replenished at the start of each window (rolling or calendar-based).
- Budget is tracked per-service and per-SLO.

### 26.3 Burn Rate Alerting

Based on the Google SRE workbook approach:

| Burn Rate | Window | Alert Severity | Action |
|---|---|---|---|
| 1x (budget burns evenly) | 30 days | Logged only | No action |
| 2x | 6 hours | Warning | Notify team lead |
| 4x | 30 minutes | Page SRE | Open incident if not already open |
| 8x | 5 minutes | Critical page | Auto-escalate to incident commander |

Alerting checks burn rate over multiple windows simultaneously:
- If 2x burn over 6h → warning (you'll exhaust budget in 12h).
- If 8x burn over 5min → critical (you'll exhaust budget in 15min).

### 26.4 Multi-Window, Multi-Burn-Rate Alerts

```python
def evaluate_slo_burn_rate(slo, current_attainment):
    # Check all burn rate windows concurrently
    alerts = []
    for burn_rate, window, severity in BURN_RATE_CONFIG:
        window_budget_consumption = budget_consumed_in_window(slo, window)
        expected = burn_rate * slo.error_budget_per_window(window)

        if window_budget_consumption >= expected:
            alerts.append({
                "severity": severity,
                "burn_rate": burn_rate,
                "window": window,
                "time_remaining_to_exhaustion": estimate_time_remaining(slo, burn_rate)
            })

    return alerts
```

---

## 27. Chaos Engineering & Resilience Testing

### 27.1 Philosophy

AstraWatch uses chaos engineering to proactively validate that its own healing mechanisms work and
that monitored services are resilient. Chaos experiments are scheduled, measured, and automatically
rolled back if SLOs breach.

### 27.2 Integration

- **Chaos Mesh** runs in the cluster as the execution engine for fault injection.
- Experiments are defined as CRDs that the AstraWatch Operator monitors.
- Experiments are scheduled via the same `AutoHealingRule` mechanism but with `kind: ChaosExperiment`.

```yaml
apiVersion: astrawatch.io/v1
kind: ChaosExperiment
metadata:
  name: payment-service-pod-kill
spec:
  targetService: payment-v2
  schedule: "0 14 * * 5" # Every Friday at 2 PM
  experiment:
    type: PodChaos
    action: pod-kill
    duration: 120s
    selector:
      matchLabels:
        app: payment-v2
  rollback:
    type: auto # Auto-restart killed pods
  guardrails:
    sloThreshold: 95 # If SLO drops below 95%, abort experiment
    maxErrorRate: 0.02 # If error rate exceeds 2%, abort
    businessHoursOnly: true
status:
  lastRun: "2026-08-01T14:00:00Z"
  lastResult: "PASSED" # PASSED, FAILED, ABORTED
```

### 27.3 Experiment Types

| Experiment | What It Tests | Default Duration |
|---|---|---|
| Pod kill | Does the service survive individual pod loss? | 120s |
| Network latency injection | Does the service degrade gracefully with 500ms added latency? | 300s |
| Resource starvation (CPU/Memory) | Does OOM/HPA kick in as expected? | 180s |
| DNS failure | Does the service handle DNS lookup failures with retries? | 60s |
| Kafka partition leader failure | Does the consumer group rebalance correctly? | 120s |
| Database connection pool exhaustion | Does the connection pool recover after throttling? | 120s |

### 27.4 Resilience Score

Each service has a resilience score (0-100) based on:
- **Experiment pass rate:** % of chaos experiments that passed.
- **Healing success rate:** % of auto-healing actions that succeeded.
- **MTTR trend:** is MTTR improving or degrading over time?
- **Blast radius containment:** do failures stay contained to the service or cascade?

The score is displayed on the service catalog page and tracked over time as a reliability trend.

---

## 28. Meta-Observability & Self-Monitoring

### 28.1 Architecture

AstraWatch monitors itself using... AstraWatch, deployed in a separate "meta" cluster/namespace.

```
┌────────────────────────────────────────────┐
│  Production Cluster (Monitored Services)    │
│  ┌─────────┐ ┌─────────┐ ┌──────────────┐ │
│  │ Service │ │ Service │ │ AstraWatch    │ │
│  │ A       │ │ B       │ │ (collector,   │ │
│  └─────────┘ └─────────┘ │ analyzer,     │ │
│                          │ orchestrator) │ │
│                          └──────┬───────┘ │
│                                 │ metrics  │
└─────────────────────────────────┼─────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────┐
│  Meta Cluster (AstraWatch's Own Monitoring)     │
│  ┌──────────────┐ ┌────────┐ ┌──────────────┐  │
│  │ AstraWatch    │ │ Grafana│ │ Alertmanager │  │
│  │ (meta only)   │ │ (meta) │ │ (meta)       │  │
│  └──────────────┘ └────────┘ └──────────────┘  │
│  If meta cluster goes down, production         │
│  AstraWatch continues running — it just        │
│  loses its own dashboard until meta recovers.  │
└────────────────────────────────────────────────┘
```

### 28.2 Internal SLOs for AstraWatch Services

| Service | SLO Target | SLI |
|---|---|---|
| Go Collector ingestion | 99.99% | % of batches successfully produced to Kafka within 2s |
| Python Analyzer detection | 99.9% | % of anomaly detection requests completing within 5s |
| Java Orchestrator API | 99.99% | Availability of `/health` endpoint |
| Kafka | 99.99% | No broker leadership changes > 2/min |
| PostgreSQL | 99.99% | Query latency p99 < 100ms |

### 28.3 Self-Diagnosis Endpoints

Each service exposes a detailed `/health` endpoint beyond simple liveness:

```json
{
  "status": "HEALTHY",
  "uptime": "72h14m",
  "version": "1.2.3",
  "dependencies": [
    {"name": "kafka", "status": "HEALTHY", "lag": 0},
    {"name": "postgresql", "status": "DEGRADED", "latency_p99_ms": 250},
    {"name": "redis", "status": "HEALTHY", "hit_rate": 0.89}
  ],
  "goroutines": 142,
  "memory_mb": 128,
  "last_errors": [
    {"time": "2026-08-01T10:00:00Z", "message": "Kafka produce timeout", "count": 3}
  ]
}
```

### 28.4 What Happens When Meta Goes Down

1. Production AstraWatch continues running autonomously — it does not depend on the meta cluster
   for any data-plane operation.
2. The meta Grafana dashboard goes dark, but the production cluster alerts still fire via
   Alertmanager (which runs in the production cluster).
3. A separate "heartbeat" CronJob (runs on a completely independent schedule, even in a different
   cloud) pings both clusters every 60s. If the meta cluster is unresponsive for 5 min, it pages
   the on-call engineer via PagerDuty (separate PagerDuty service, not dependent on AstraWatch).

---

## 29. API Versioning & Developer Experience

### 29.1 API Versioning Strategy

- **Version prefix:** `/api/v1/`, `/api/v2/` in URL path.
- **Version lifecycle:** each version has `PREVIEW → STABLE → DEPRECATED → SUNSET` phases.
- **Deprecation:** a version enters `DEPRECATED` status 6 months before sunset. All deprecated
  endpoints return a `Sunset: <date>` and `Deprecation: true` HTTP header.
- **Sunset:** endpoints return `410 Gone` with a link to migration docs.
- **Backward compatibility:** within a major version, fields may be added but never removed or
  made required. Use `json:omitempty` for new optional fields.
- **Version negotiation:** the request version is determined by the URL prefix. Internal services
  use gRPC with versioned proto packages (`com.astrawatch.v1`, `com.astrawatch.v2`).

### 29.2 Developer SDKs & Tools

| Tool | Language | Purpose |
|---|---|---|
| `astrawatchctl` | Go CLI | Manage incidents, view metrics, trigger healing from terminal |
| `astrawatch-py` | Python SDK | Programmatic access to all APIs for scripting |
| `astrawatch-go` | Go SDK | Integration for Go services to emit custom metrics |
| `astrawatch-js` | JavaScript SDK | Browser-side RUM + API client for dashboard embedding |
| `terraform-provider-astrawatch` | Terraform | Manage dashboards, alert rules, runbooks as code |

### 29.3 API Documentation

- **Swagger/OpenAPI 3.0:** auto-generated from Java SpringDoc and Go swaggo annotations.
- **Interactive API playground:** Swagger UI available at `/swagger-ui.html` in dev/staging
  environments.
- **Postman collection:** auto-published on each release for manual testing.
- **Rate limits:** documented per-endpoint with `X-RateLimit-Remaining` headers.

### 29.4 Outgoing Webhooks

AstraWatch can push events to external systems via webhooks:

| Event Type | Payload | Example Consumer |
|---|---|---|
| `incident.created` | Full incident object | Jira (auto-create ticket) |
| `incident.resolved` | Incident ID + resolution | ServiceNow (close ticket) |
| `healing.started` | Action details | Slack (notify channel) |
| `healing.completed` | Action result | Status page (auto-update) |
| `anomaly.detected` | Anomaly details | Custom dashboard |

Webhook delivery is retried with exponential backoff (3 attempts) and logged. Undeliverable after
3 retries → webhook is disabled and owner is notified.

---

## 30. Backend Libraries & Dependencies

### 30.1 Go Collector Service

| Purpose | Library | Import Path |
|---|---|---|
| HTTP framework | **Gin** | `github.com/gin-gonic/gin` |
| gRPC server | **gRPC-Go** | `google.golang.org/grpc` |
| Protobuf | **protobuf-go** | `google.golang.org/protobuf` |
| Kafka client | **franz-go** (preferred over Sarama) | `github.com/twmb/franz-go` |
| ClickHouse client | **clickhouse-go** | `github.com/ClickHouse/clickhouse-go/v2` |
| Redis client | **go-redis** | `github.com/redis/go-redis/v9` |
| K8s client | **client-go** | `k8s.io/client-go` |
| K8s watch cache | **informer** | `k8s.io/client-go/informers` |
| Local cache | **ristretto** | `github.com/dgraph-io/ristretto` |
| Prometheus metrics | **prometheus-go** | `github.com/prometheus/client_golang` |
| OpenTelemetry | **otel-go** | `go.opentelemetry.io/otel` |
| Zstd compression | **go-zstd** | `github.com/klauspost/compress/zstd` |
| JWT validation | **jwt-go** | `github.com/golang-jwt/jwt/v5` |
| Rate limiter | **rate** | `golang.org/x/time/rate` |
| Validation | **go-playground/validator** | `github.com/go-playground/validator/v10` |
| Config | **viper** | `github.com/spf13/viper` |
| Structured logging | **zap** | `go.uber.org/zap` |
| Testing | **testify** + **gomock** | `github.com/stretchr/testify` |
| HTTP client | **resty** | `github.com/go-resty/resty/v2` |
| Feature flags | **openfeature-go** | `github.com/open-feature/go-sdk` |
| MCP server | **mcp-go** | `github.com/mark3labs/mcp-go` |
| PII masking | **regexp2** | `github.com/dlclark/regexp2` |

### 30.2 C++ Agent (eBPF / Host-Level)

| Purpose | Library |
|---|---|
| eBPF programs | **libbpf** (C library) |
| BPF ring buffer | `BPF_MAP_TYPE_RINGBUF` (kernel) + **libbpf** userspace |
| gRPC server | **grpc++** + **protobuf** |
| Compression | **zstd** (C binding) |
| mTLS | **OpenSSL** / **BoringSSL** |
| Local buffering | **mmap** (memory-mapped file) |
| Build system | **CMake** + **vcpkg** / **Conan** |
| Testing | **Google Test** + **Google Benchmark** |
| Self-metrics | **Prometheus-cpp** |

### 30.3 Python Analyzer Service

| Purpose | Library | Notes |
|---|---|---|
| Web framework | **FastAPI** + **uvicorn** | Async, auto OpenAPI docs |
| Statistical detection | **scipy** + **numpy** + **statsmodels** | EWMA, z-score, Granger causality |
| Isolation Forest | **scikit-learn** | `sklearn.ensemble.IsolationForest` |
| Deep learning | **TensorFlow** / **PyTorch** | LSTM autoencoder |
| Forecasting | **prophet** (Meta) | Seasonal decomposition |
| Feature engineering | **pandas** + **numpy** | Rolling windows, aggregates |
| Model registry | **MLflow** | Versioning, shadow deployment |
| Kafka async | **aiokafka** | Consumer + producer |
| Task queue | **celery** + **redis** | Scheduled retraining |
| ClickHouse client | **clickhouse-driver** | Metrics read |
| Pydantic | **pydantic** v2 | Schema validation |
| Auth | **python-jose** + **passlib** | JWT + bcrypt |
| Async HTTP | **httpx** | Cross-service calls |
| Testing | **pytest** + **pytest-asyncio** | Unit + integration |
| ML explainability | **shap** | SHAP feature importance |
| Self-metrics | **prometheus-client** | /metrics endpoint |
| OpenTelemetry | **opentelemetry-python** | Distributed tracing |
| Config | **pydantic-settings** | Environment config |

### 30.4 Java Orchestrator (Spring Boot 3)

| Purpose | Library | Maven Artifact |
|---|---|---|
| Framework | **Spring Boot 3.4+** + **Spring Web** | `spring-boot-starter-web` |
| State machine | **Spring Statemachine** | `spring-statemachine-core` |
| Workflow SDK | **Temporal Java SDK** | `io.temporal:temporal-sdk` |
| Kafka | **Spring Kafka** | `spring-kafka` |
| JPA | **Spring Data JPA** + **Hibernate 6** | `spring-boot-starter-data-jpa` |
| PostgreSQL | **PostgreSQL JDBC** + **HikariCP** | `org.postgresql:postgresql` |
| Migrations | **Flyway** | `flyway-core`, `flyway-postgresql` |
| Auth | **Spring Security** + **OAuth2 Resource Server** | `spring-boot-starter-oauth2-resource-server` |
| JWT library | **nimbus-jose-jwt** | `com.nimbusds:nimbus-jose-jwt` |
| Redis | **Spring Data Redis** + **Lettuce** | `spring-boot-starter-data-redis` |
| HTTP client | **WebClient** (reactive) | `spring-boot-starter-webflux` |
| Validation | **Jakarta Validation** + **Hibernate Validator** | `spring-boot-starter-validation` |
| OpenAPI | **SpringDoc** | `springdoc-openapi-starter-webmvc-ui` |
| Mapping | **MapStruct** | DTO ↔ Entity |
| Boilerplate | **Lombok** | `@Data`, `@Builder`, etc. |
| Testing | **JUnit 5** + **Mockito** + **Testcontainers** | Integration tests |
| Architecture | **ArchUnit** | Enforce hexagonal layering |
| Metrics | **Micrometer** + **Prometheus** | `micrometer-registry-prometheus` |
| OpenTelemetry | **OpenTelemetry Java Agent** | Auto-instrumentation |
| Resilience | **Resilience4j** | Circuit breaker, retry |
| Feature flags | **OpenFeature Java SDK** | `dev.openfeature:sdk` |
| Config | **Spring Cloud Config** | Centralized configuration |
| Config bus | **Spring Cloud Bus** + **Kafka** | Dynamic config refresh |

### 30.5 Node.js Realtime Gateway

| Purpose | Library | Notes |
|---|---|---|
| WebSocket | **Socket.io** v4 | Bidirectional real-time |
| Redis adapter | **@socket.io/redis-adapter** | Horizontal scaling |
| Kafka client | **kafkajs** | Modern Kafka library |
| JWT | **jsonwebtoken** + **jwk-to-pem** | Token validation |
| Redis client | **ioredis** | Pub/sub + cache |
| Process mgmt | **PM2** | Multi-core clustering |
| Logging | **winston** + **pino** | Structured logs |
| Health checks | **node-health-check** | K8s probes |
| Self-metrics | **prom-client** | /metrics endpoint |

### 30.6 Kubernetes Operator (Go)

| Purpose | Library | Import Path |
|---|---|---|
| Controller framework | **controller-runtime** | `sigs.k8s.io/controller-runtime` |
| Scaffolding | **kubebuilder** | CLI tool |
| CRD generation | **controller-tools** | `sigs.k8s.io/controller-tools/cmd/controller-gen` |
| K8s client | **client-go** | `k8s.io/client-go` |
| API machinery | **api-machinery** | `k8s.io/apimachinery` |
| Metrics client | **custom-metrics-apiserver** | `k8s.io/metrics` |
| HTTP client | **resty** | Call Orchestrator |
| Testing | **envtest** | Real K8s API integration tests |
| Chaos Mesh | **chaos-mesh/api** | `github.com/chaos-mesh/chaos-mesh/api/v1alpha1` |

### 30.9 Go Stripe Payment Service (Go, Port 8085)

| Purpose | Library | Import Path |
|---|---|---|
| HTTP server | **net/http** | `net/http` |
| Stripe SDK | **stripe-go** | `github.com/stripe/stripe-go/v78` |
| Billing Portal | **stripe-go/billingportal** | `github.com/stripe/stripe-go/v78/billingportal/session` |
| Checkout Session | **stripe-go/checkout** | `github.com/stripe/stripe-go/v78/checkout/session` |
| Subscriptions | **stripe-go/subscription** | `github.com/stripe/stripe-go/v78/subscription` |
| Webhooks | **stripe-go/webhook** | `github.com/stripe/stripe-go/v78/webhook` |
| Config | **config** | `astrawatch/payment-service/internal/config` |
| Testing | **httptest** + **testing** | `net/http/httptest` |

---

### 30.10 Shared Infrastructure

| Component | Technology | Alternative |
|---|---|---|
| Message broker | **Apache Kafka** (with KRaft mode) | **Redpanda** (zero-JVM, faster) |
| Schema registry | **Confluent Schema Registry** | **Redpanda Schema Registry** (built-in) |
| Time-series DB | **ClickHouse** | **TimescaleDB** (PostgreSQL extension) |
| Relational DB | **PostgreSQL 16+** | |
| Logs store | **Elasticsearch 8+** | **OpenSearch** (FOSS fork) |
| Cache / pub-sub | **Redis 7+** | **Dragonfly** (drop-in, higher perf) |
| Monitoring | **Prometheus** + **Grafana** | **Thanos** (for long-term Prometheus) |
| Workflow engine | **Temporal Server** | |
| Auth server | **Keycloak** | **Ory Hydra** + **Ory Kratos** (lighter) |
| Secrets | **HashiCorp Vault** | |
| Service mesh | **Istio** | **Linkerd** (simpler, no Envoy) |
| GitOps | **ArgoCD** | **FluxCD** (simpler, no CRD overload) |
| K8s packaging | **Helm** | |
| IaC | **Terraform** / **OpenTofu** | **Pulumi** (TypeScript/Python native) |
| CI/CD | **GitHub Actions** | **GitLab CI** / **Woodpecker** |
| Container scanning | **Trivy** | **Grype** + **Syft** |
| Policy-as-Code | **OPA** / **Gatekeeper** | **Kyverno** (K8s-native) |

### 30.8 Development & Build Tools

| Tool | Purpose |
|---|---|
| **Taskfile** / **Makefile** | Build orchestration across all services |
| **Docker Compose** | Local development environment (Kafka, Postgres, Redis, ClickHouse) |
| **Tilt** / **Skaffold** | K8s inner-loop development |
| **Golangci-lint** | Go code quality |
| **Ruff** + **mypy** | Python linting + type checking |
| **ESLint** + **Prettier** | Node.js linting |
| **Checkstyle** + **PMD** | Java code quality |
| **Trivy** | Container vulnerability scanning |
| **Helm-docs** | Auto-generate Helm chart READMEs |
| **K9s** | Terminal K8s cluster manager |
| **K6** + **xk6-kafka** | Load testing ingestion + Kafka pipelines |
| **goreleaser** | Go binary release automation |
| **jib** (Google) | Java container image builder (no Dockerfile needed) |
| **ko** | Go container image builder |

--- 

*End of document.*
