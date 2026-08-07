# AstraWatch — Deep System Audit Report (Aug 2026)

Strict, evidence-based audit of backend, frontend, DB, Redis, ClickHouse, Kafka, and the
production wiring. Every claim below was verified by reading actual source/config files.

---

## EXECUTIVE VERDICT (honest)

**The backend is a strong, well-layered skeleton. The frontend is a beautiful shell. The
product is NOT yet SaaS-grade, and the production wiring is broken in three critical places.**

Score (my honest call):
- Backend architecture & security: **7.5/10**
- Frontend UI/UX polish: **8/10**
- Frontend ↔ backend contract fidelity: **5/10**
- Production (docker/nginx) readiness: **3/10**
- Dashboard "is this a real observability SaaS?" — **No, it's a demo-grade skeleton.** No
  time-series charts anywhere; several panels lie or are empty in production; a large part of
  the backend has no UI; and the realtime incident notification loop is dead.

---

## PART 1 — INFRASTRUCTURE & DATA LAYER

### 1.1 docker-compose services (verified)
zookeeper, kafka (confluent 7.5), postgres (postgis 16), clickhouse, redis 7, mailhog,
collector, orchestrator, analyzer, realtime, payment, operator, frontend. Good coverage.

### 1.2 ⚠️ CRITICAL — Dev routing ≠ Prod routing (the app only truly works in dev)

`frontend/vite.config.ts` (DEV):
| path | target |
|---|---|
| /api/v1/catalog | **collector:8080** |
| /api/v1/billing | **payment:8085** |
| /api/v1 | orchestrator:8082 |
| /v1/anomaly, /v1/predict | **analyzer:8000** |
| /v1 | collector:8080 |
| /ws | realtime:8084 |

`infra/docker/nginx.conf` (PROD):
| path | target |
|---|---|
| /api | **orchestrator:8082** (everything, incl. catalog + billing!) |
| /v1 | collector:8080 (incl. /v1/anomaly — collector has no such route!) |
| /ws | realtime:8084 |

**Consequences in production:**
1. **Service Catalog is empty in prod.** `GET /api/v1/catalog/services` hits the orchestrator,
   which reads the **Postgres `services` table**. V11 deleted the six mock seed rows, and
   **nothing writes to that table**: there is no ServiceRepository, no `INSERT INTO services`
   anywhere in the orchestrator, and the collector's `createService` returns HTTP 501
   ("service registration is not supported"). → Dashboard services count, Catalog grid,
   Topology nodes, Status-page service list, and SLO list are all **empty/zero in prod**.
2. **Billing 404s in prod.** `/api/v1/billing/*` hits the orchestrator, which has **no public
   billing controller** (only `/api/v1/internal/billing/plan-changed`, an internal webhook
   receiver). The payment service on 8085 is **not proxied by nginx at all**.
3. **Analyzer HTTP endpoints 404 in prod.** `/v1/anomaly/detect`, `/v1/predict/*` hit the
   collector (8080), which has no such routes. (The Kafka anomaly loop still works — see Part 3.)

**Fix direction:** add nginx locations for `/api/v1/catalog` → collector, `/api/v1/billing` →
payment, `/v1/anomaly` + `/v1/predict` → analyzer; or make the orchestrator the single API
gateway and proxy internally.

### 1.3 ⚠️ The `services` table is an orphan — no service-registration path exists
After V11, the Postgres `services` table has zero rows and zero writers. The *real* catalog
lives in the collector, derived from distinct `service_id`s observed in ClickHouse telemetry.
Pick one source of truth (recommend: collector/ClickHouse) and delete or repoint the
orchestrator's CatalogController so prod and dev agree.

### 1.4 Postgres migrations (V1–V12) — good, with two notes
- V11 correctly removes the mock seed; V12 makes synthetics uptime nullable. Good hygiene.
- No `tenant_id`/`org_id` on `services` — catalog rows are global. If multi-tenant isolation
  matters for the catalog, add an org column + filter.

### 1.5 ClickHouse — genuinely well designed ✅
- `metrics`/`logs`/`traces` raw tables, 30-day TTL, `PARTITION BY toYYYYMM`, `tenant_id` on
  every row, `ORDER BY (tenant_id, service_id, ...)`.
- 1m / 5m SummingMergeTree rollups + materialized views, log_errors_5m, 90d/365d TTL.
- Collector consumer uses `PrepareBatch` with column lists matching the schema. This is the
  strongest part of the data layer.

### 1.6 Redis — used, but thin
- Orchestrator: anomaly dedup key (24h) + a healing-enabled flag.
- Collector: batch-id dedup SetNX (5 min).
- Realtime: Socket.io redis adapter + event dedup cache.
- **Missing for SaaS-grade:** no caching of hot query/catalog results, no distributed
  rate-limit store (collector uses in-memory), no session store, no leader-election usage.

### 1.7 Kafka — topics exist, but the event graph is incomplete
Topics created: raw-metrics, raw-logs, raw-traces, anomaly-detected, feedback-received,
healing-actions. Realtime subscribes to a pattern including `incident-*` and `slo-*` —
**see Part 3 finding 3.2: those topics are never produced.**

### 1.8 Observability of the product itself
- Prometheus scrapes collector + cxx-agent only.
- **Grafana dashboard.json ships with `"panels": []` — a blank dashboard.** The landing page
  markets "Grafana integration" but none ships.
- Terraform `main.tf` contains only an AWS provider block — **zero resources**.
- Helm charts exist per service (thin values). docker-compose is the real deployable.

---

## PART 2 — BACKEND SERVICES

### 2.1 Orchestrator (Java, :8082) — strong surface
Auth (login/register/oauth2 google+github/refresh/logout/me/verify/reset/MFA/API keys/
sessions/invites/lockout), incidents (create/assign/comment/resolve/escalate/timeline),
healing (trigger/approve/rollback/history/validation), runbooks, SLO, status-page (public +
admin), synthetics, notifications (channels/rules/maintenance/preferences/unsubscribe),
on-call schedules, escalation policies, postmortems (+ my new real list endpoint), GitHub
integration, entitlements, internal billing receiver. JWT + tenant scoping + CSRF + CORS.
Security posture is genuinely good (verified in prior audits).

**Backend surface with NO frontend consumer (dead-from-UI):**
- incidents: create / assign / comment
- healing: trigger / validation
- runbooks: update / versions / execute / executions
- slo: create
- status-page: createComponent / updateComponentStatus / subscribers / maintenance
- notifications: channels CRUD / maintenance-windows / preferences / unsubscribe
- **on-call: everything (no page at all)**
- **escalation policies: everything (no page at all)**
- entitlements (api.ts defines it, never called)
- github: create-pr (modal only tests/connects)
- postmortems: create/update/export/action-items (page only lists)
- auth: MFA setup/verify/disable, invite, switch-team, lockout status (no UI)

### 2.2 Collector (Go, :8080) — good ingest, honest about limits
Ingest REST + OTLP + gRPC agent, batch producer (zstd, idempotent via Redis SetNX), ClickHouse
consumer with DLQ, query endpoints (logs/traces/metrics), telemetry-derived catalog with
JWT auth. `createService`/`updateService` honestly return 501. **Known gap:** `listServices`
returns `name = service_id` (raw UUID), `tier: ""`, and **no `status` field** — the frontend
renders "UNKNOWN" status and empty tier names (see Part 4).

### 2.3 Analyzer (Python, :8000) — real pipeline, HTTP side unreachable in prod
Consumes raw-metrics (buffer), raw-logs (log miner), feedback-received. Runs periodic
detection every 30s → publishes `anomaly-detected` with real log evidence → orchestrator
creates the incident. Feedback → async retrain. This Kafka loop is complete and real.
HTTP `/v1/anomaly/detect`, `/v1/anomaly/root-cause`, `/v1/predict/*` exist but are
unreachable through prod nginx and unused by the UI (useAnomalyDetection is never mounted).

### 2.4 Operator (Go) — auto-healing is real and guarded
Consumes `healing-actions`, executes with blast-radius guards (protected namespaces, dry-run,
replica caps, restart-loop guard, unavailable-replicas guard), publishes
`healing-completed`/`healing-failed`. Orchestrator closes the loop (incident RESOLVED/ESCALATED).

### 2.5 Realtime (Node, :8084) — solid gateway, but the event graph is missing producers
JWT+API-key auth (fail-closed), Redis adapter, per-tenant rooms, Kafka→Socket.io bridge.
**Problem:** it subscribes to `incident-*`, `healing-triggered`, `slo-*` — see Part 3.

### 2.6 Payment (Go, :8085) — real Stripe loop, but unreachable in prod
Real Stripe checkout/portal/subscriptions/webhooks with HMAC verification, JWT auth,
internal notifier → orchestrator plan-changed → entitlements. Requires STRIPE_* env vars
(empty by default → checkout fails until configured). **Not proxied by nginx** → prod 404.

### 2.7 cxx-agent (C++/eBPF) — real probes, gRPC to collector. Good.

---

## PART 3 — KAFKA EVENT GRAPH (who publishes / who consumes)

| Topic | Producer | Consumer | Works? |
|---|---|---|---|
| raw-metrics | collector | clickhouse writer + analyzer | ✅ |
| raw-logs | collector | clickhouse writer + analyzer(log miner) | ✅ |
| raw-traces | collector | clickhouse writer | ✅ |
| anomaly-detected | analyzer | orchestrator (→incident) + realtime | ✅ |
| feedback-received | analyzer (submit_feedback) | analyzer (retrain) | ✅ (HTTP unreachable in prod) |
| healing-actions | orchestrator | operator | ✅ |
| healing-completed / healing-failed | operator | orchestrator + realtime | ✅ |
| **incident-created / incident-updated** | **NOBODY** | realtime (pattern) | ❌ **never fires** |
| **healing-triggered** | **NOBODY** (orchestrator publishes healing-actions instead) | realtime | ❌ **never fires** |
| slo-* | **NOBODY** | realtime (pattern) | ❌ **never fires** |

**3.2 ⚠️ The realtime notification layer is half-dead.** The UI toasts for
`incident.created`, `incident.updated`, and `healing.started` can never fire because no
service publishes those topics. Only `anomaly.detected` and `healing.completed/failed`
actually reach the browser. The Dashboard "Recent Incidents" therefore only updates via
30s polling, not push.

---

## PART 4 — FRONTEND ↔ BACKEND CONTRACT AUDIT

### 4.1 Endpoints the frontend calls — verified present
auth.*, authExtra.*, incidents.list/get/resolve/escalate/timeline, healing.approve/rollback/
history, metrics.query, logs.query, traces.query, services.list, services.getDependencies,
slo.get, statusPage.get, synthetics.*, users.*, alerting.listRules/createRule/toggleRule,
runbooks.list/create, postmortems.list, github.*, billing.* — all exist on the backend.

### 4.2 ⚠️ Shape mismatches (frontend expects, backend doesn't send)
1. **Services have no `status`.** Collector returns `{id, name(=id), team:"", tier:"",
   healthScore}`. Frontend CatalogPage/StatusPage/Dashboard filter on `svc.status ===
   'HEALTHY'`. Result: every service shows "UNKNOWN", and the Status page's overall banner
   computes `down===0 && degraded===0 && incidents.length===0` → **"All Systems Operational"
   even with zero services and zero data. The green banner can lie.**
2. **Service names are raw UUIDs** (collector uses id as name) — Dashboard/Catalog show
   `uuid-strings`, no friendly names, empty tier badges.
3. Collector health score comes from logs only (15-min window); orchestrator status derives
   from open incidents. **Two different health definitions** shown across pages.

### 4.3 ⚠️ Dead/unused API surface in the UI (features you built but never wired)
See Part 2.1 list. On-Call, Escalation, Notification Channels, Maintenance Windows, SLO
creation, Status-page management, Runbook execution, Postmortem authoring, MFA, Invites —
all backend-only today. The sidebar has no pages for them.

### 4.4 AdminPage GitHub state is localStorage, not server truth
`githubRepo`/`autoPR` come from localStorage; the page never calls
`GET /api/v1/integrations/github/repos` on load. The "Connected" badge can disagree with
the backend.

---

## PART 5 — "IS MY DASHBOARD SaaS-GRADE?" — STRICT ANSWER: NO

What the Dashboard actually shows (all real API data, no mocks — good):
- 4 stat cards (Services, Active Incidents, Healthy %, Critical)
- Recent Incidents list (top 5)
- Service Health list (top 8, healthScore bar)

What a SaaS observability dashboard MUST have and AstraWatch lacks:
1. **Zero time-series charts.** The `MetricsChart` (ECharts) component exists but is used
   **nowhere** in the app (verified: no page imports it). No metric graphs, no sparklines,
   no trend lines. This alone disqualifies it as an observability product UI.
2. **No live log tail** — Logs Explorer polls every 10s; no WebSocket streaming view.
3. **No trace waterfall** — Trace Explorer is a flat list, not a span waterfall.
4. **No SLO error-budget visualization** (no charts, no burn-rate history).
5. **No service map edges** — Topology renders nodes, but `service_dependencies` is empty
   (V11 deleted the fake edges; nothing collects real dependencies).
6. **No alert routing UI** (channels, on-call, escalation) — rules only.
7. **No usage/metering UI** to support billing.
8. **No audit-log UI**, **no team/org switch UI** despite `/auth/switch-team` existing.
9. **Status page can display a false green** (see 4.2.1).
10. **CustomDashboardBuilder** is a canvas with placeholder nodes — no real charts, no
    persistence, no "save dashboard" (widgets vanish on refresh).

---

## PART 6 — PRIORITIZED FIX LIST (do these in order)

**P0 — production is broken (fix first):**
1. nginx: route /api/v1/catalog → collector, /api/v1/billing → payment, /v1/anomaly +
   /v1/predict → analyzer (or make orchestrator the gateway and proxy).
2. Resolve the catalog split-brain: single source of truth (collector/ClickHouse).
3. Add `status` to collector `listServices` (or drop the UI's reliance on it) so the
   Status-page banner and health filters stop lying.

**P1 — realtime event graph:**
4. Publish `incident-created` / `incident-updated` from IncidentService (or from
   AnomalyEventConsumer after create), and `healing-triggered` from HealingOrchestrationService
   (or rename `healing-actions` mapping in realtime). Delete the dead `slo-*` subscription or
   implement SLO events.

**P2 — SaaS-grade dashboard:**
5. Use MetricsChart to render real `/v1/query` metric time-series on the Dashboard per service.
6. Trace waterfall view; live log streaming via the realtime socket.
7. Honest empty states everywhere (already mostly done) + never show "All Systems Operational"
   with zero services.

**P3 — close the UI gap:**
8. On-Call schedules + Escalation policies + Notification channels + Maintenance windows pages.
9. SLO creation UI, Status-page management UI, Runbook execute UI, Postmortem authoring UI.
10. MFA + Invite + Switch-team UI in Settings.
11. Load GitHub integration from the backend on AdminPage (not localStorage).

**P4 — SaaS extras:**
12. Real Grafana dashboards (the shipped one is empty panels).
13. Terraform resources (currently only a provider block).
14. Redis caching of catalog + hot queries; distributed rate limiting.
15. Usage metering → billing.

---

*This report is derived from direct source inspection (docker-compose, nginx.conf,
vite.config.ts, all migrations, ClickHouse DDL, Kafka producers/consumers, every frontend
page's endpoint calls). Timestamps are from the Aug 2026 working tree.*
