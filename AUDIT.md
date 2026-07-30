# AstraWatch — Master Project Audit & Gap Analysis Report

**Date:** July 30, 2026  
**Audited Base:** Entire Codebase (`services/`, `frontend/`, `infra/`, `scripts/`, `tests/`, `Makefile`, `Taskfile.yml`)  
**Specification:** `AstraWatch-Technical-Documentation.md`  

---

## Executive Summary

A comprehensive, line-by-line technical audit was executed across all components of the **AstraWatch Intelligent Observability & Autonomous Remediation Platform**. While the foundation for service communication, data pipelines, state machines, and UI components is established, there are **critical build failures, runtime exceptions, missing microservice integrations, database schema mismatches, and completely missing views/modules** when evaluated against the official Technical Documentation.

---

## Key System-Wide Critical Bugs (Blockers)

1. **Frontend CSS & Build Crash**:
   - **File**: [`frontend/src/index.css:L1`](file:///Users/abuzar/Desktop/Astrawatch/frontend/src/index.css#L1)
   - `index.css` contains `@import "tailwindcss";`, but `tailwindcss` / `@tailwindcss/vite` is missing from `package.json`. `npm run build` fails immediately.

2. **Java Orchestrator Fatal DB Schema Mismatch**:
   - **Files**: [`V1__initial_schema.sql`](file:///Users/abuzar/Desktop/Astrawatch/services/orchestrator/src/main/resources/db/migration/V1__initial_schema.sql) vs [`SLODefinition.java`](file:///Users/abuzar/Desktop/Astrawatch/services/orchestrator/src/main/java/com/astrawatch/orchestrator/domain/model/SLODefinition.java)
   - Flyway creates table `slo_definitions` without `created_at`. JPA entity defines `@Column(name = "created_at", nullable = false)`. Spring Boot crashes on startup.

3. **Go Collector Kafka Topic Cross-Contamination**:
   - **File**: [`services/collector/internal/produce/producer.go:L80-L102`](file:///Users/abuzar/Desktop/Astrawatch/services/collector/internal/produce/producer.go#L80-L102)
   - `ProduceLog()` and `ProduceTrace()` omit the `record.Topic` field, forcing all logs (`raw-logs`) and traces (`raw-traces`) to be sent to `raw-metrics`.

4. **Python Analyzer Runtime Exceptions**:
   - **Root Cause Crash**: [`anomaly_service.py:L66`](file:///Users/abuzar/Desktop/Astrawatch/services/analyzer/app/services/anomaly_service.py#L66) accesses `request.metrics` on `RootCauseRequest`, throwing `AttributeError`.
   - **Isolation Forest Crash**: [`isolation_forest.py:L58`](file:///Users/abuzar/Desktop/Astrawatch/services/analyzer/app/ml/detectors/isolation_forest.py#L58) calls `.score_samples()` without calling `.fit()`, raising `NotFittedError`.
   - **LSTM Train Crash**: [`lstm_autoencoder.py:L58`](file:///Users/abuzar/Desktop/Astrawatch/services/analyzer/app/ml/detectors/lstm_autoencoder.py#L58) invokes `os.makedirs` before `import os` on line 97, throwing `NameError`.

5. **Node.js Real-time Event De-duplication Bug**:
   - **File**: [`services/realtime/src/index.js:L166`](file:///Users/abuzar/Desktop/Astrawatch/services/realtime/src/index.js#L166)
   - Unkeyed Kafka messages produce `cacheKey = "${eventType}:undefined"`, causing all subsequent unkeyed messages within 10s to be flagged as duplicates and dropped.

6. **C++ Agent Dangling Pointer & Wrap-Around Math**:
   - **Files**: [`bpf_manager.cpp:L128`](file:///Users/abuzar/Desktop/Astrawatch/services/cxx-agent/src/bpf_manager.cpp#L128) & [`ring_buffer.cpp:L156-L162`](file:///Users/abuzar/Desktop/Astrawatch/services/cxx-agent/src/ring_buffer.cpp#L156-L162)
   - eBPF poller stores a dangling pointer to a stack-allocated callback struct. MMap ring buffer returns full capacity when buffer is 100% full.

7. **Kubernetes Operator Uninitialized Event Recorder**:
   - **File**: [`services/operator/cmd/manager/main.go:L44-L51`](file:///Users/abuzar/Desktop/Astrawatch/services/operator/cmd/manager/main.go#L44-L51)
   - `AutoHealingRuleReconciler` is instantiated with `Recorder: nil`, silently dropping all Kubernetes audit/status events.

---

## Detailed Service-by-Service Audit & Gap Matrix

### 1. React Frontend (`frontend/src`)

| Feature Area | Technical Doc Spec | Codebase Implementation Status | Specific Gaps / Line Numbers |
| :--- | :--- | :--- | :--- |
| **Build & Setup** | Vite + React + Tailwind | 🔴 Broken | Missing `tailwindcss` in `package.json` ([index.css:L1](file:///Users/abuzar/Desktop/Astrawatch/frontend/src/index.css#L1)). Redux store setup in `store/` but app missing `<Provider>`, Zustand used instead. |
| **Navigation** | React Router client-side routing | 🟡 Flawed | Hardcoded `window.location.href` in [IncidentsPage.tsx:L72](file:///Users/abuzar/Desktop/Astrawatch/frontend/src/features/incidents/IncidentsPage.tsx#L72) causing hard page reloads. |
| **Dashboard** | Virtualized service grid (`TanStack Virtual`), burn rate color-coding | 🟡 Partial | Array slice of 8 items, no virtual grid, no burn rate colors ([Dashboard.tsx:L82-L156](file:///Users/abuzar/Desktop/Astrawatch/frontend/src/features/dashboard/Dashboard.tsx#L82-L156)). |
| **Incidents & War Room** | Incident timeline, risk score pre-confirmation, ChatOps war room, RCA | 🟡 Partial | Timeline displays raw JSON; search input ignored; missing root cause panel, war room, and merge controls. |
| **Healing Plans** | Approve & Rollback actions, execution progress, validation | 🔴 Flawed | Approve and Rollback buttons have **no `onClick` handlers** ([HealingPage.tsx:L96](file:///Users/abuzar/Desktop/Astrawatch/frontend/src/features/healing/HealingPage.tsx#L96)). |
| **Logs & Traces** | Lucene search, live tail, flame graph, `traceId` correlation | 🔴 Mocked | Both pages query `/api/v1/incidents` and fabricate mock log lines/spans with random math ([LogsExplorerPage.tsx:L59](file:///Users/abuzar/Desktop/Astrawatch/frontend/src/features/logs/LogsExplorerPage.tsx#L59)). |
| **Topology Graph** | React Flow graph populated from trace dependency API | 🟡 Partial | Edges generated via sequential loop instead of fetching `/api/v1/catalog/services/:id/dependencies`. |
| **SLO & Burn Rate** | Error budget burn-rate charts, 2x/4x/8x SRE thresholds | 🔴 Mocked | Hardcoded targets in memory, `burnRate = 0.5` across all services ([SLOPage.tsx:L30](file:///Users/abuzar/Desktop/Astrawatch/frontend/src/features/slo/SLOPage.tsx#L30)). |
| **Missing Views** | Service Catalog, Status Page, Runbooks, Postmortems, Synthetics, Admin Panel | 🔴 Missing | Pages for `/catalog`, `/status-page`, `/runbooks`, `/postmortems`, `/synthetics`, and `/admin` do not exist in `frontend/src`. |
| **Global UI & UX** | Cmd+K search, Keyboard shortcuts, Notification inbox, Error Boundaries | 🔴 Missing | No global search modal, no shortcut handlers (`g i`), no notification bell dropdown, no `<ErrorBoundary>` wrappers. |

---

### 2. C++ Host Agent (`services/cxx-agent`)

| Feature Area | Technical Doc Spec | Codebase Implementation Status | Specific Gaps / Line Numbers |
| :--- | :--- | :--- | :--- |
| **eBPF Tracing** | Sched latency, TCP probes, Block I/O ring buffer | 🟢 Implemented | Implemented in `bpf/*.bpf.c` and polled in `bpf_manager.cpp`. |
| **Host Metrics** | Procfs parsing (`/proc/stat`, `/proc/meminfo`, `/proc/net/dev`, `/proc/diskstats`) | 🔴 Missing | Memory usage is hardcoded (`55.0%`), Procfs reader is missing ([main.cpp:L108](file:///Users/abuzar/Desktop/Astrawatch/services/cxx-agent/src/main.cpp#L108)). |
| **Ring Buffer MMap** | MMap file persistence, capacity checks, backlog replay | 🟡 Flawed | Wrap-around math bug in `write_available()` ([ring_buffer.cpp:L156](file:///Users/abuzar/Desktop/Astrawatch/services/cxx-agent/src/ring_buffer.cpp#L156)). Plaintext ASCII formatting inside binary file. |
| **Transport** | gRPC / HTTP push with zstd compression | 🟡 Discrepancy | Uses gzip instead of zstd ([grpc_client.cpp:L81](file:///Users/abuzar/Desktop/Astrawatch/services/cxx-agent/src/grpc_client.cpp#L81)). `HttpClient` implemented but unused in `main.cpp`. |

---

### 3. Go Telemetry Collector (`services/collector`)

| Feature Area | Technical Doc Spec | Codebase Implementation Status | Specific Gaps / Line Numbers |
| :--- | :--- | :--- | :--- |
| **Ingest Endpoints**| Batch metrics, streaming logs, OTLP traces, gRPC | 🟢 Implemented | Implemented in `internal/ingest/handler.go` & `grpc_server.go`. |
| **Kafka Ingestion** | Produce to `raw-metrics`, `raw-logs`, `raw-traces` | 🔴 Critical Bug | `ProduceLog` & `ProduceTrace` omit `Topic` field, sending all logs and traces to `raw-metrics` ([producer.go:L80](file:///Users/abuzar/Desktop/Astrawatch/services/collector/internal/produce/producer.go#L80)). |
| **Auth Enforcement**| Auth middleware exempts health and metrics ingestion | 🟡 Flawed | `/v1/ingest/metrics/batch` and `/v1/agent/metrics` require user JWT, causing agents without user JWT to be rejected ([main.go:L239](file:///Users/abuzar/Desktop/Astrawatch/services/collector/cmd/collector/main.go#L239)). |
| **Service Catalog** | Full catalog CRUD, dependency graph, health scorecards | 🟡 Partial | `PUT /services/:id`, `GET /services/:id/dependencies`, and `POST /services/:id/scorecard` are missing. |
| **ClickHouse Writer**| Consume Kafka topics and write columnar metrics/logs | 🔴 Missing | Only read/query side (`QueryService`) exists. Kafka-to-ClickHouse writer component is missing. |
| **Schema Registry** | Avro encoding with Confluent Schema Registry | 🔴 Missing | Kafka messages produced as raw JSON byte arrays without Avro header framing or registry validation. |

---

### 4. Python Analyzer Service (`services/analyzer`)

| Feature Area | Technical Doc Spec | Codebase Implementation Status | Specific Gaps / Line Numbers |
| :--- | :--- | :--- | :--- |
| **FastAPI Core** | App initialization, health check, router composition | 🟢 Implemented | Implemented in `app/__init__.py`. |
| **Anomaly Engines** | EWMA, Dynamic Z-score, Isolation Forest, LSTM, Granger causality | 🔴 Bugs | `IsolationForest` throws `NotFittedError` ([isolation_forest.py:L58](file:///Users/abuzar/Desktop/Astrawatch/services/analyzer/app/ml/detectors/isolation_forest.py#L58)). `LSTM` train has `NameError` ([lstm_autoencoder.py:L58](file:///Users/abuzar/Desktop/Astrawatch/services/analyzer/app/ml/detectors/lstm_autoencoder.py#L58)). |
| **Root Cause API** | `POST /v1/anomaly/root-cause` | 🔴 Critical Bug | Throws `AttributeError: 'RootCauseRequest' object has no attribute 'metrics'` ([anomaly_service.py:L66](file:///Users/abuzar/Desktop/Astrawatch/services/analyzer/app/services/anomaly_service.py#L66)). |
| **Router Declarations**| Unique route endpoints for predictions and model control | 🟡 Flawed | Duplicate route declarations in `predict.py` and `models.py` for `/v1/models/status` and `/v1/models/retrain`. |
| **State Persistence** | ClickHouse metrics persistence, `anomaly_feedback` table, Shadow mode | 🔴 Missing | No ClickHouse DB writer, feedback stored in RAM list, shadow mode & concept drift auto-rollback missing. |

---

### 5. Node.js Real-time Gateway (`services/realtime`)

| Feature Area | Technical Doc Spec | Codebase Implementation Status | Specific Gaps / Line Numbers |
| :--- | :--- | :--- | :--- |
| **WebSocket & Auth**| Socket.io server, ping/pong, JWT handshake, Redis pub/sub | 🟢 Implemented | Implemented in `src/index.js`, `socketAuth.js`, and `redis/adapter.js`. |
| **Event Fan-out** | Kafka consumer relay to WS rooms | 🔴 Critical Bug | Event de-duplication drops ALL unkeyed Kafka messages after the first one ([index.js:L166](file:///Users/abuzar/Desktop/Astrawatch/services/realtime/src/index.js#L166)). |
| **Directory Cleanup**| Clean repository directory structure | 🟡 Artifact | Malformed directory `{src` exists in `services/realtime/` from invalid shell command. |
| **Token Renewal** | Silent WebSocket token renewal handshake | 🔴 Missing | Server disconnects expired clients with `{ disconnected: true }` without token refresh flow. |

---

### 6. Java Orchestrator Service (`services/orchestrator`)

| Feature Area | Technical Doc Spec | Codebase Implementation Status | Specific Gaps / Line Numbers |
| :--- | :--- | :--- | :--- |
| **Security & Auth** | JWT, Refresh tokens, RBAC, API Keys, SAML 2.0 / OIDC | 🔴 Mocked | Auth endpoints return hardcoded mock JSON tokens ([AuthController.java:L16](file:///Users/abuzar/Desktop/Astrawatch/services/orchestrator/src/main/java/com/astrawatch/orchestrator/adapter/in/web/AuthController.java#L16)). SAML/OIDC missing. |
| **DB Schema & JPA** | Flyway migrations matching PostgreSQL schema specs | 🔴 Critical Bug | Flyway `V1__initial_schema.sql` missing `created_at` in `slo_definitions` table; crashes JPA startup ([SLODefinition.java](file:///Users/abuzar/Desktop/Astrawatch/services/orchestrator/src/main/java/com/astrawatch/orchestrator/domain/model/SLODefinition.java)). |
| **Incidents & State Machine** | Spring StateMachine state transitions (`OPEN -> CLOSED`) | 🟢 Implemented | Implemented in `StateMachineConfig.java` and `IncidentController.java`. |
| **Auto-Healing Engine**| Risk scoring, blast radius limit, K8s Operator / Temporal execution | 🟡 Partial | Heuristic risk score, `executeAction` updates DB status but **does not trigger K8s Operator or Temporal** ([HealingOrchestrationService.java:L100](file:///Users/abuzar/Desktop/Astrawatch/services/orchestrator/src/main/java/com/astrawatch/orchestrator/application/service/HealingOrchestrationService.java#L100)). |
| **SLO & Metrics** | Real-time burn rate calculation from telemetry metrics | 🔴 Mocked | `/api/v1/slo/{id}/status` returns hardcoded numbers ([SLOController.java:L50](file:///Users/abuzar/Desktop/Astrawatch/services/orchestrator/src/main/java/com/astrawatch/orchestrator/adapter/in/web/SLOController.java#L50)). |
| **Alerting & Escalation**| PagerDuty, Slack webhooks, Twilio SMS, Email dispatch | 🔴 Missing | Notification provider dispatchers are missing in `NotificationService.java`. |
| **Idempotency** | PostgreSQL `idempotency_keys` persistent storage | 🟡 Flawed | `IdempotencyFilter.java` uses in-memory `ConcurrentHashMap` instead of Postgres DB table. |

---

### 7. Kubernetes Operator (`services/operator`)

| Feature Area | Technical Doc Spec | Codebase Implementation Status | Specific Gaps / Line Numbers |
| :--- | :--- | :--- | :--- |
| **`AutoHealingRule` CRD**| CRD spec, condition evaluation, cooldown timer | 🟢 Implemented | Implemented in `internal/api/v1/autohealingrule_types.go` & `controller`. |
| **Event Recorder** | Kubernetes Event generation for audit log | 🔴 Bug | `Recorder` initialized as `nil` in [main.go:L44](file:///Users/abuzar/Desktop/Astrawatch/services/operator/cmd/manager/main.go#L44), silently dropping all events. |
| **Secondary CRDs** | `HealPlan`, `AstraAgent`, `RemediationAction` CRDs | 🔴 Missing | Only `AutoHealingRule` exists in `internal/api/v1/`. |
| **Trigger Execution** | POST `/api/v1/healing/trigger` with JWT & Idempotency key | 🟡 Flawed | Trigger request in controller omits `Authorization: Bearer <JWT>` and `Idempotency-Key` headers. |

---

### 8. Infrastructure, Deployment & Testing (`infra/`, `scripts/`, `tests/`)

| Feature Area | Technical Doc Spec | Codebase Implementation Status | Specific Gaps / Line Numbers |
| :--- | :--- | :--- | :--- |
| **Docker Compose** | Multi-container local stack for all services | 🟡 Flawed | All core infra + 6 services included in `docker-compose.yml`, but `operator` is omitted. `Dockerfile.operator` missing. |
| **Helm Charts** | Production Helm charts for K8s deployment | 🔴 Missing | Subdirectories in `infra/helm/*` exist but are **100% empty (0 files)**. |
| **Terraform IaC** | Cloud infrastructure provisioning (AWS/GCP/Azure) | 🔴 Missing | Directory `infra/terraform/` is **100% empty (0 files)**. |
| **Observability Stack**| Prometheus scrape configs & Grafana dashboards | 🔴 Missing | `/metrics` exposed on services, but `prometheus.yml` and Grafana dashboard JSONs are missing. |
| **Security & Secrets**| mTLS zero-trust mesh, Vault secret management | 🔴 Missing | Plaintext HTTP/TCP and static env vars used in `docker-compose.yml`. |
| **CI/CD Pipelines** | GitHub Actions workflows for build, lint, test, scan | 🔴 Missing | `.github/workflows/` directory missing. |
| **Test Suites** | Integration, E2E, and service unit test suites | 🔴 Missing / Flawed | Root `tests/` and `scripts/` directories empty. `Makefile` and `Taskfile.yml` omit tests for 4+ services. |

---

## Actionable Remediation & Implementation Roadmap

To bring the repository from its current state to full production readiness matching `AstraWatch-Technical-Documentation.md`, the remaining tasks should be addressed in the following sequence:

### Phase 1: Critical Bug & Build Fixes (Immediate Blockers)
1. **Frontend**: Install Tailwind CSS dependencies in `frontend/package.json` (`tailwindcss`, `@tailwindcss/vite`), fix `index.css`, replace `window.location.href` reloads with React Router `navigate()`, and attach `onClick` handlers to Healing Page Approve/Rollback buttons.
2. **Orchestrator DB Migration**: Update `V1__initial_schema.sql` to include `created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL` on `slo_definitions` table.
3. **Collector Kafka Routing**: Fix `ProduceLog()` and `ProduceTrace()` in `producer.go` to explicitly specify `record.Topic = "raw-logs"` and `record.Topic = "raw-traces"`.
4. **Analyzer ML Fixes**: Fix `AttributeError` in `anomaly_service.py:L66`, fix `NotFittedError` check in `isolation_forest.py`, move `import os` to top of `lstm_autoencoder.py`, remove duplicate routes in `models.py`, and renormalize ensemble weights.
5. **Realtime Gateway Dedup**: Fix event deduplication key in `realtime/src/index.js` to avoid dropping unkeyed Kafka messages. Delete malformed `{src` directory.
6. **C++ Agent eBPF Fix**: Fix dangling pointer in `bpf_manager.cpp:L128` and correct wrap-around capacity math in `ring_buffer.cpp`.
7. **K8s Operator Recorder**: Pass `mgr.GetEventRecorderFor("autohealingrule-controller")` to reconciler in `main.go`.

### Phase 2: Full API & Service Integration
1. **Java Orchestrator Auth**: Replace mock auth responses in `AuthController.java` with real BCrypt password hashing, JJWT token generation/verification, and PostgreSQL `users` table persistence.
2. **Orchestrator Healing Execution**: Connect `HealingOrchestrationService` to trigger the K8s Operator REST endpoint and Temporal workflows.
3. **Go Collector Catalog API**: Implement missing endpoints (`PUT /services/:id`, `GET /services/:id/dependencies`, `POST /services/:id/scorecard`) and exempt ingestion endpoints from user JWT requirement.
4. **Kafka-to-ClickHouse Pipeline**: Implement the telemetry consumer/writer service to persist metrics and logs into ClickHouse.
5. **C++ Host Metrics**: Implement `/proc/meminfo`, `/proc/stat`, `/proc/net/dev`, and `/proc/diskstats` parsers in `cxx-agent`.

### Phase 3: Missing Frontend Views & Explorers
1. **Real Explorers**: Connect Log Explorer and Trace Explorer to actual ClickHouse/Collector query APIs instead of mocking from `/api/v1/incidents`.
2. **Missing Pages**: Implement Service Catalog (`/catalog`), Status Page (`/status-page`), Runbooks (`/runbooks`), Postmortems (`/postmortems`), Synthetics (`/synthetics`), and Admin Panel (`/admin`).
3. **Global Features**: Implement Cmd+K search modal, notification inbox dropdown, keyboard shortcuts, and React `<ErrorBoundary>` wrappers.

### Phase 4: Infrastructure, CI/CD & Testing
1. **Operator Packaging**: Create `infra/docker/Dockerfile.operator` and add `operator` to `docker-compose.yml`.
2. **IaC & Deployment**: Create Helm charts in `infra/helm/` and Terraform scripts in `infra/terraform/`.
3. **Observability Assets**: Add `prometheus.yml` scrape config and Grafana dashboard JSON models.
4. **CI/CD Pipelines**: Add `.github/workflows/ci.yml` for automated linting, building, and testing across all services.
5. **Test Automation**: Fill `tests/` directory with integration and E2E suites, and update `Makefile`/`Taskfile.yml` to run tests across all 7 services.
