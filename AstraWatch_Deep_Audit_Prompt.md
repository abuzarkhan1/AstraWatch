# AstraWatch — Deep Codebase Audit, Architecture Review & Strategic Implementation Plan

> **Prompt Version:** 1.0  
> **Project:** AstraWatch — Intelligent Observability & Autonomous Remediation SaaS Platform  
> **Scope:** Full monorepo audit, documentation cross-validation, system design review, and corrective implementation roadmap

---

## 🎯 PRIME DIRECTIVE

You are a **principal-level software architect and senior SRE** who has been hired to perform a rigorous, line-by-line technical audit of the **AstraWatch** monorepo — a polyglot, event-driven observability and auto-remediation SaaS platform. Your mandate is threefold:

1. **Audit** every service, frontend, infrastructure config, and documentation file at the deepest level possible — not summaries, but actual code review with line citations.
2. **Cross-validate** all implementation against the official technical documentation ([`AstraWatch-Technical-Documentation.md`](file:///Users/abuzar/Desktop/Astrawatch/AstraWatch-Technical-Documentation.md)), product vision ([`PRODUCT.md`](file:///Users/abuzar/Desktop/Astrawatch/PRODUCT.md)), design system ([`DESIGN.md`](file:///Users/abuzar/Desktop/Astrawatch/DESIGN.md)), and the OpenAPI spec under [`docs/openapi/`](file:///Users/abuzar/Desktop/Astrawatch/docs/openapi/).
3. **Produce** a corrective implementation plan with concrete, prioritized, actionable steps — if the project is heading in the wrong direction, explicitly state it and redirect with authority.

This audit must be **exhaustive, honest, and prescriptive**. Do not soften findings. Do not skip files. Do not generalize. Every finding must cite a specific file and line number.

---

## 🏗️ PROJECT CONTEXT (What AstraWatch Is)

AstraWatch is planned as a **multi-tenant SaaS platform** that allows developers and SRE teams to:

- **Integrate** their servers, Kubernetes clusters, and applications via a lightweight agent (C++ eBPF agent or SDK) that ships logs, metrics, and distributed traces.
- **Analyze** all ingested telemetry in real-time using ML-powered anomaly detection (Isolation Forest ensemble) running on the Python Analyzer service.
- **Detect** errors — small or catastrophic — and perform **deep root-cause analysis** across the full telemetry stack (logs → metrics → traces correlation).
- **Auto-heal** by triggering the Kubernetes Operator (Go controller) which executes remediation actions (pod restarts, rollbacks, HPA scaling, network policy changes) within a **blast-radius boundary system** that strictly limits what can be auto-remediated without human approval.
- **Notify** the affected user via email (and eventually Slack, PagerDuty) with the detected anomaly, root-cause analysis summary, the remediation action taken, and what the user can do next — all in a human-readable, actionable format.
- **Gate everything** behind a subscription-based access model (Go Payment Service, Stripe) with per-tenant data isolation, RBAC, and configurable remediation permission boundaries.

**Core architectural stack:**
- **C++ Agent** — eBPF kernel probes (syscall/network/disk), gRPC to Collector
- **Go Collector** (Gin) — Telemetry ingest, Kafka producer, read-side query API
- **Python Analyzer** (FastAPI + Celery) — Isolation Forest ML, anomaly scoring, root-cause correlation
- **Java Orchestrator** (Spring Boot) — Incident lifecycle, approval workflows, email notifications
- **Go K8s Operator** — Custom resource controller, healing action execution, blast-radius guard
- **Node.js Realtime Gateway** — Socket.io, WebSocket fan-out, Redis pub/sub
- **Go Payment Service** — Stripe integration, subscription management, usage metering
- **React Frontend** (Vite + TypeScript) — Dashboard, log explorer, incident timeline, settings
- **Infra** — Kafka, ClickHouse/TimescaleDB, PostgreSQL, Elasticsearch, Redis, Vault PKI

---

## 📋 AUDIT INSTRUCTIONS — EXECUTE ALL SECTIONS IN ORDER

### PHASE 1 — REPOSITORY STRUCTURE AUDIT

**Task:** Map the complete repository tree. For every directory and file found:

1. Verify the file exists at the path documented in `AstraWatch-Technical-Documentation.md` (Section 3 — Service Deep-Dives lists expected internal layouts).
2. Flag any **missing files** that the documentation specifies should exist but don't.
3. Flag any **orphaned files** that exist in the repo but are not mentioned anywhere in docs.
4. Check the root `Makefile` and `Taskfile.yml` — do all targets actually exist? Are there references to scripts or binaries that are missing?
5. Check `.github/` CI workflows — are they complete, do they reference correct service paths, do all jobs have valid steps?

**Output format for each service:**
```
SERVICE: <name>
  DOCUMENTED STRUCTURE (from TDD): ...
  ACTUAL STRUCTURE (from repo): ...
  MISSING FILES: [list with citations to TDD section]
  ORPHANED FILES: [list]
  STRUCTURAL VERDICT: PASS | PARTIAL | FAIL
```

---

### PHASE 2 — LINE-BY-LINE CODE AUDIT (ALL SERVICES)

For each service listed below, perform a **deep, line-by-line review**. Do not skip any file. Cite every finding with the exact file path and line number range.

#### 2.1 — C++ Agent (`services/cxx-agent/`)

Audit the following with extreme precision:

- **Build system:** Is CMakeLists.txt correct? Does it link against `libbpf` and `libz` properly? Are compiler flags (`-O2`, `-fno-omit-frame-pointer`, sanitizers for debug builds) present?
- **eBPF programs:** Are `.bpf.c` files present? Do they correctly attach to `sched_switch`, `tcp_sendmsg`, `tcp_recvmsg`, `block_rq_issue`? Is `BPF_MAP_TYPE_RINGBUF` used (not the deprecated `BPF_MAP_TYPE_PERF_EVENT_ARRAY`)?
- **Ring buffer handling:** Is zero-copy read implemented via `ring_buffer__poll()`? Is the 500ms batch interval configurable?
- **Local durability:** Is the memory-mapped ring file fallback implemented? Is exponential backoff + jitter present? Are backlogged points tagged with original timestamps?
- **Transport:** Is mutual TLS configured? Is zstd compression used on the gRPC channel? Is the client cert loaded from Vault PKI or a local path (acceptable for dev)?
- **Failure mode:** Is oldest-data-first drop implemented when the local buffer fills?
- **Dead code:** Any commented-out code blocks, unused variables, or `TODO` comments that indicate incomplete implementation?

Flag every line that deviates from the Technical Design Document. Classify each finding as:
- 🔴 **CRITICAL** — Will cause runtime failure, data loss, or security vulnerability
- 🟠 **HIGH** — Incorrect behavior, deviation from spec that breaks a feature
- 🟡 **MEDIUM** — Suboptimal implementation, missing fallback, tech debt
- 🟢 **LOW** — Stylistic, minor, or documentation issue

---

#### 2.2 — Go Collector Service (`services/collector/`)

Audit every `.go` file:

- **Entry point** (`cmd/collector/main.go`): Is graceful shutdown implemented with `context.WithCancel` and OS signal handling (`SIGTERM`, `SIGINT`)? Is the startup order correct (Kafka producer before HTTP server)?
- **Ingest handlers** (`internal/ingest/`): 
  - Are all three telemetry types (metrics, logs, traces) handled?
  - Is input validation strict (required fields, size limits, type checks)?
  - Is the `Idempotency-Key` header checked on all mutating endpoints?
  - Is gRPC-to-HTTP translation for the C++ agent input handled correctly?
- **Kafka producer** (`internal/kafka/`): Is it using sarama or confluent-kafka-go? Is it configured with `RequiredAcks: WaitForAll`? Is the producer using bounded channels? What is the worker pool size — is it configurable?
- **Backpressure:** Is there a bounded channel between HTTP handlers and the Kafka producer? What happens when the channel is full — does it block, drop, or return 429?
- **Query API** (`internal/query/`): Does it hit ClickHouse/TimescaleDB read replicas? Are queries parameterized (no SQL injection)? Is pagination implemented?
- **Middleware:** Is rate limiting middleware present? Is JWT validation middleware applied to all protected routes? Is request logging structured (zerolog/zap)?
- **Tests:** Are unit tests present for ingest handlers? Is there a mock Kafka producer for testing? What is the test coverage percentage?

---

#### 2.3 — Python Analyzer Service (`services/analyzer/`)

Audit every `.py` file:

- **FastAPI app** (`main.py` or `app/`): Are all documented endpoints present? Are request/response models validated with Pydantic v2?
- **ML pipeline** (`ml/` or `models/`):
  - Is Isolation Forest actually implemented (scikit-learn or custom)?
  - Is it an ensemble (multiple IF models with different contamination parameters)?
  - Is the model trained on startup or loaded from a serialized file?
  - Is there model versioning? What happens if the model file is missing?
  - Is the 99.4% precision claim testable — are there evaluation scripts and test datasets?
- **Celery workers** (`tasks/` or `workers/`): Are async analysis jobs properly defined? Is the Celery broker configured to use Redis? Is task retry logic with exponential backoff present?
- **Kafka consumer:** Is the analyzer consuming from the correct Kafka topics? Are consumer group IDs correct? Is manual offset commit used (to avoid data loss)?
- **Root-cause correlation:** Is there logic that correlates anomalies across metrics + logs + traces? What is the correlation algorithm — time-window matching? Causal graph?
- **Anomaly scoring:** Is there a scoring threshold that can be tuned per tenant? Are false positives tracked?
- **Email notification trigger:** Does the analyzer emit an event to Kafka when an anomaly is confirmed, or does it call the Orchestrator directly? Which path matches the documentation?
- **Security:** Are there any hardcoded API keys, secrets, or model paths? Is the OpenAI/LLM API key (if used) loaded from environment variables only?

---

#### 2.4 — Java Orchestrator Service (`services/orchestrator/`)

Audit every `.java` file:

- **Spring Boot application:** Is `@SpringBootApplication` configured correctly? Are all required beans defined?
- **Incident lifecycle** (`/incidents/`): Are all documented states present (OPEN, INVESTIGATING, AUTO_HEALING, AWAITING_APPROVAL, RESOLVED, SUPPRESSED)? Are state transitions enforced (no invalid transitions)?
- **Approval workflow:** Is there a human-in-the-loop approval gate for high-blast-radius actions? Is the approval timeout configured? What happens on timeout — auto-approve or auto-reject?
- **Email notification service:**
  - Is JavaMail or Spring Mail configured?
  - Are email templates present (HTML + plaintext fallback)?
  - Does the email contain: anomaly description, root-cause summary, action taken, blast radius, what the user can do next, link to dashboard incident page?
  - Is there a retry mechanism for failed email sends?
  - Are unsubscribe links and GDPR-compliant opt-out mechanisms present?
- **Kafka consumer:** Is the Orchestrator consuming from the `anomaly-detected` topic? Is it idempotent (same anomaly event processed twice shouldn't create two incidents)?
- **PostgreSQL:** Is schema migration managed (Flyway or Liquibase)? Are all documented tables present (`incidents`, `healing_actions`, `audit_log`, `users`, `tenants`, `rbac_roles`)?
- **RBAC:** Are role-based access checks implemented on all sensitive endpoints? Are roles: ADMIN, OPERATOR, VIEWER correctly scoped?
- **Blast-radius boundaries:** Is there a documented boundary configuration? Can tenants configure what actions are allowed without approval? Is this enforced at the Orchestrator level?

---

#### 2.5 — Go Kubernetes Operator (`services/operator/`)

Audit every `.go` file:

- **Controller-runtime setup:** Is `controller-runtime` used? Is the manager configured with a correct leader election mechanism (critical for multi-replica deployments)?
- **CRD definitions:** Are the Custom Resource Definitions (CRDs) present? Do they match the documented schema?
- **Reconciliation loop:** Is the `Reconcile()` function correctly implemented? Is it idempotent?
- **Healing actions:** Are all documented action types implemented?
  - Pod restart
  - Deployment rollback
  - HPA scale-up
  - Network policy enforcement
  - ConfigMap hot-reload
- **Blast-radius guard:** Is there a check before executing any action that verifies the action is within the tenant's configured blast radius? Is this check enforced server-side (not just UI)?
- **MTTR claim:** The documentation claims 3-second MTTR — is there any telemetry or measurement code that actually tracks time-to-remediation?
- **Audit log:** Does every healing action write to the audit log in PostgreSQL?
- **Dry-run mode:** Is there a dry-run flag that simulates actions without applying them (critical for safety)?

---

#### 2.6 — Node.js Realtime Gateway (`services/realtime/`)

Audit every `.js`/`.ts` file:

- **Socket.io setup:** Is the server configured with correct CORS origins (not wildcard `*` in production)?
- **Authentication:** Is the WebSocket handshake authenticated with a JWT? Is the token validated on every connection (not just the first)?
- **Redis pub/sub:** Is fan-out from Redis channels to WebSocket rooms implemented correctly? Are rooms tenant-scoped (no cross-tenant data leakage)?
- **Event types:** Are all documented real-time events implemented? (anomaly-detected, healing-triggered, incident-updated, metric-spike)
- **Rate limiting:** Is there a per-connection message rate limit to prevent abuse?
- **Memory leaks:** Are socket rooms cleaned up when clients disconnect? Is there a max-connections-per-tenant limit?

---

#### 2.7 — Go Payment Service (`services/payment-service/`)

Audit every `.go` file:

- **Stripe integration:** Is the Stripe webhook signature verification implemented (`stripe.ConstructEvent`)? Is the webhook secret loaded from environment only?
- **Subscription plans:** Are the documented tiers (Free, Pro, Enterprise) implemented? Are feature gates enforced per plan?
- **Usage metering:** Is there logic to track telemetry ingestion volume per tenant and report to Stripe for usage-based billing?
- **Idempotency:** Are all Stripe API calls using idempotency keys?
- **Failure handling:** What happens if a Stripe call fails — is the tenant's service interrupted immediately or is there a grace period?
- **PCI compliance:** Is the raw card data ever logged or stored? (This is a CRITICAL security finding if yes.)
- **Access boundaries:** Is there a clear, enforceable API that other services can query to check if a tenant's subscription allows a specific action?

---

#### 2.8 — React Frontend (`frontend/`)

Audit every `.tsx`/`.ts` file:

- **Project structure:** Is the Vite + TypeScript project structured per the documentation? Are all documented pages and routes implemented?
- **Route coverage:** Are these routes implemented?
  - `/landing` — Marketing landing page
  - `/auth/login` — Sign in
  - `/auth/register` — Register
  - `/dashboard` — Main observability dashboard
  - `/incidents/:id` — Incident detail with timeline
  - `/logs` — Log explorer with Elasticsearch query
  - `/metrics` — Metric graphs
  - `/settings` — Tenant/billing/RBAC settings
- **Design system compliance:** Cross-check every component against `DESIGN.md`:
  - Is the background `#000000` with indigo radial spotlights?
  - Are featured cards using `border-blue-500/50 shadow-[0px_-13px_300px_0px_#0900ff]`?
  - Is `Plus Jakarta Sans` / `Inter` / `JetBrains Mono` used correctly per element type?
  - Are CTAs using the documented gradient and shadow?
  - Are all animations present (VerticalCutReveal, number-flow spring transitions)?
- **State management:** Is there a clear data-fetching strategy (React Query / SWR)? Are loading, error, and empty states handled on every data-dependent component?
- **WebSocket integration:** Is the Socket.io client connected to the Realtime Gateway? Are events handled and do they update the UI in real-time?
- **Authentication flow:** Is JWT stored securely (httpOnly cookie, not localStorage)? Is token refresh implemented? Are protected routes guarded?
- **API client:** Is there a typed API client (axios + types, or fetch with generics)? Are all API calls hitting the correct service endpoints?
- **Accessibility:** Are interactive elements keyboard-accessible? Are ARIA labels present?
- **Performance:** Are large list views virtualized? Are heavy components code-split?
- **Security:** Are there any XSS vulnerabilities (dangerouslySetInnerHTML without sanitization)? Is Content-Security-Policy set?

---

### PHASE 3 — DOCUMENTATION CROSS-VALIDATION

**Task:** For every claim in `AstraWatch-Technical-Documentation.md`, verify whether the implementation matches.

Create a table with these columns:

| TDD Section | Documented Claim | File(s) Where It Should Be Implemented | Actual Status | Gap Description |
|---|---|---|---|---|
| 3.1 | C++ Agent uses BPF_MAP_TYPE_RINGBUF | `services/cxx-agent/ebpf/*.bpf.c` | ✅ / ⚠️ / ❌ | ... |
| ... | ... | ... | ... | ... |

Fill this table for **every** major documented claim. Do not skip any section. Mark each as:
- ✅ **IMPLEMENTED** — Code matches documentation exactly
- ⚠️ **PARTIAL** — Code partially implements it, gaps noted
- ❌ **MISSING** — Documented but not implemented at all
- 🚫 **INCORRECT** — Implemented but differently from documentation (flag as deviation)

---

### PHASE 4 — OPENAPI / API CONTRACT AUDIT

**Task:** Validate that all API endpoints documented in `docs/openapi/` and `docs/api-reference.html` are actually implemented in the respective services.

For each endpoint in the OpenAPI spec:
1. Verify it exists in the service router/controller.
2. Verify the request/response schema matches the implementation.
3. Verify authentication requirements match (which endpoints require JWT, which are public).
4. Verify HTTP status codes match (documented 404 but service returns 500?).
5. Flag any **undocumented endpoints** that exist in the code but are missing from the spec.

---

### PHASE 5 — SECURITY AUDIT

Perform an explicit security review across the entire codebase:

**Authentication & Authorization:**
- [ ] Are all service-to-service calls authenticated (mTLS or service account tokens)?
- [ ] Is there any endpoint missing JWT validation?
- [ ] Are admin-only routes protected with role checks?
- [ ] Is there any broken object-level authorization (user can access other tenant's data)?

**Secrets & Configuration:**
- [ ] Are there any hardcoded secrets, API keys, passwords, or connection strings anywhere in the codebase? (Search for patterns: `sk_`, `password=`, `apikey=`, `secret=`)
- [ ] Are all secrets loaded from environment variables or a secrets manager?
- [ ] Are `.env` files committed to git (check `.gitignore`)?

**Multi-Tenancy / Data Isolation:**
- [ ] Is every database query scoped by `tenant_id`?
- [ ] Can a user of tenant A ever read data belonging to tenant B? (Check every query that joins on user-supplied identifiers)
- [ ] Are Kafka topics partitioned per tenant? Or is there a single topic with tenant_id filtering (and are consumers filtering correctly)?

**Input Validation:**
- [ ] Is there SQL injection risk anywhere? (Parameterized queries everywhere?)
- [ ] Is there SSRF risk in any service that makes outbound HTTP calls based on user input?
- [ ] Are file upload endpoints (if any) restricted by MIME type and file size?

**Blast-Radius Boundaries (Critical for SaaS Safety):**
- [ ] Is the blast-radius boundary enforced server-side in BOTH the Orchestrator AND the Operator?
- [ ] Can a tenant escalate their own blast-radius permissions?
- [ ] Is there an audit log entry for every action the Operator takes, including denied actions?

---

### PHASE 6 — FLOW DIAGRAMS

Generate the following diagrams in **Mermaid syntax**. Each diagram must reflect the **actual implemented code**, not just the documentation. Note any places where the actual flow differs from the documented flow.

#### Diagram 1: End-to-End Telemetry Ingestion Flow
```
[C++ Agent] → [gRPC] → [Go Collector] → [Kafka] → [Python Analyzer] → [Anomaly Detection]
```
Include: error paths, retry logic, backpressure mechanisms, data transformation at each hop.

#### Diagram 2: Anomaly Detection & Root-Cause Analysis Flow
```
[Kafka Consumer] → [ML Scoring] → [Root-Cause Correlation] → [Confidence Threshold] → [Alert/Suppress]
```
Include: the scoring pipeline, how metrics + logs + traces are correlated, how the confidence threshold is applied.

#### Diagram 3: Auto-Healing Decision Flow
```
[Anomaly Confirmed] → [Blast-Radius Check] → [Approval Gate?] → [K8s Operator] → [Action Executed]
```
Include: every branching decision, the approval timeout path, the dry-run path, and the audit log write.

#### Diagram 4: Email Notification Flow
```
[Incident Created] → [Email Template] → [SMTP Send] → [Retry Queue] → [User Inbox]
```
Include: what data is in the email, retry mechanism, unsubscribe path.

#### Diagram 5: Multi-Tenant Data Isolation Architecture
```
[API Request + JWT] → [Tenant Extraction] → [Scoped DB Query] → [Tenant-Scoped Response]
```
Include: where tenant_id is injected, how it propagates through each service, and the WebSocket room isolation.

#### Diagram 6: Frontend Data Flow
```
[React Page] → [React Query] → [API Client] → [Collector/Orchestrator API] → [DB]
                                              → [Socket.io] → [Redis] → [Real-time Update]
```
Include: authentication header injection, WebSocket event subscription, optimistic UI updates.

#### Diagram 7: Payment & Access Control Gate
```
[API Request] → [JWT Auth] → [Plan Check via Payment Service] → [Feature Gate] → [Action Allowed/Denied]
```
Include: how subscriptions are cached to avoid calling Payment Service on every request, and the grace period on subscription expiry.

---

### PHASE 7 — SYSTEM DESIGN VALIDATION

Evaluate the overall system design against production SaaS standards:

**Scalability:**
- Can each service scale horizontally independently? What are the bottlenecks?
- Is the Kafka partition count appropriate for expected throughput?
- Does ClickHouse have the correct TTL policies for data tiering (hot/warm/cold)?
- Is there a read-replica strategy for PostgreSQL?

**Reliability:**
- What is the current fault tolerance story? If the Python Analyzer goes down, what happens to ingested data?
- Is there a dead-letter queue (DLQ) for failed Kafka messages?
- Are database connections pooled (pgx connection pool, HikariCP)?
- Is there a circuit breaker between services (Orchestrator → Analyzer sync call)?

**Observability of AstraWatch itself (Meta-Observability):**
- Does every service expose `/metrics` in Prometheus format?
- Are structured logs (JSON) emitted by every service?
- Is there distributed tracing (OpenTelemetry) instrumented in all services?

**Cost:**
- Is there a data retention policy that prevents unbounded ClickHouse growth?
- Is there a per-tenant ingestion limit that prevents one tenant from consuming all resources?

---

### PHASE 8 — IMPLEMENTATION PLAN (CORRECTIVE & PRESCRIPTIVE)

Based on all findings from Phases 1–7, produce a **corrective implementation plan** structured as follows:

#### 8.1 — Current State Assessment

Rate the overall project on a scale of 0–100% completion for each area:
- Backend services implementation: X%
- Frontend implementation: X%
- Documentation-to-code alignment: X%
- Security hardening: X%
- Test coverage: X%
- Production readiness: X%

#### 8.2 — Critical Path (What Must Be Fixed Before Anything Else)

List all 🔴 CRITICAL findings and provide exact remediation steps with code snippets where applicable.

**Format:**
```
CRITICAL-001: [Title]
  File: services/xxx/yyy.go:L42
  Problem: [Exact description]
  Impact: [What breaks/fails]
  Fix: [Exact steps, with code snippet]
  Estimated effort: [Xh]
```

#### 8.3 — Phased Implementation Roadmap

Structure the full implementation plan into phases that each deliver a **demoable, independently valuable milestone**:

**Phase 0 — Foundation (Week 1–2)**
- What must be in place before any other development starts
- Developer environment setup, Kafka local dev, database migrations
- Health check endpoints on all services

**Phase 1 — Telemetry Pipeline MVP (Week 3–6)**
- Go Collector → Kafka → Python Analyzer (basic scoring, no ML yet)
- Log ingestion working end-to-end
- Basic React dashboard showing live metrics

**Phase 2 — ML Engine & Anomaly Detection (Week 7–10)**
- Isolation Forest training pipeline
- Anomaly scoring with configurable thresholds
- Anomaly events flowing to Orchestrator

**Phase 3 — Auto-Healing & Blast Radius (Week 11–16)**
- K8s Operator with 3 action types implemented
- Blast-radius boundary configuration per tenant
- Human approval workflow in Orchestrator

**Phase 4 — Notifications & Email (Week 17–18)**
- Email templates with full anomaly context
- Retry queue for failed sends
- Unsubscribe mechanism

**Phase 5 — Multi-Tenancy & SaaS Hardening (Week 19–22)**
- Complete tenant_id data isolation audit and fixes
- Payment Service + Stripe subscription
- Feature gates per plan

**Phase 6 — Frontend Polish & Production (Week 23–26)**
- All routes implemented per design system
- WebSocket real-time updates
- Accessibility and performance audit

**Phase 7 — Security & Compliance (Week 27–28)**
- Full secrets audit
- Penetration testing checklist
- GDPR data deletion flows

#### 8.4 — Things Being Built Wrong (Redirect)

If any of the following is detected, call it out explicitly with a recommended redirect:

| Anti-Pattern Detected | Why It's Wrong | Correct Approach |
|---|---|---|
| Synchronous service-to-service calls in the hot path | Creates coupling and cascading failures | Use Kafka events + async consumers |
| Direct cross-service DB access | Breaks service isolation | Each service owns its DB; use events or APIs |
| Secrets in source code | Critical security vulnerability | Use environment variables or Vault |
| Unbounded Kafka consumer lag | Will cause OOM or infinite processing delay | Implement consumer lag monitoring + alerting |
| Missing tenant_id scoping | Data leakage between tenants | Audit and add tenant_id to every query |
| localStorage JWT storage | XSS-vulnerable | Use httpOnly secure cookies |
| Missing DLQ | Silent data loss | Implement dead-letter queue for every consumer |

#### 8.5 — Immediate Next 3 Actions

After reading the full audit, the developer should do these three things first:

1. **[Action 1]** — Specific, concrete, executable
2. **[Action 2]** — Specific, concrete, executable
3. **[Action 3]** — Specific, concrete, executable

---

## 📐 OUTPUT FORMAT REQUIREMENTS

Your response must be structured as a **formal technical audit report** with:

1. **Executive Summary** (≤ 500 words) — Overall health rating, top 3 critical findings, top 3 biggest gaps vs. vision.
2. **Phase 1–5 Audit Results** — One section per audit phase, full detail, no abbreviation.
3. **Flow Diagrams** — All 7 diagrams in Mermaid, rendered inline.
4. **System Design Scorecard** — Tabular ratings per quality dimension.
5. **Implementation Plan** — Full phased roadmap with effort estimates.
6. **Appendix** — All findings catalogued by severity (🔴/🟠/🟡/🟢) with file:line citations.

**Do not skip any section.** If a file cannot be read, say so explicitly. If a service directory is empty, say so explicitly and flag it as a critical gap.

**Length:** This report is expected to be extremely long. Do not truncate. Do not summarize where detail is required. This is a $10,000 engineering audit — produce accordingly.

---

## ⚠️ IMPORTANT CONSTRAINTS FOR THE AUDITOR

1. **No hallucination:** Every finding must be based on actual file contents. If you cannot read a file, say so. Do not invent findings.
2. **Cite everything:** Every issue must have a `file:line` citation. Vague findings like "the collector might have issues" are unacceptable.
3. **Respect the product vision:** AstraWatch is positioned as an enterprise SaaS. Every finding should be evaluated against that bar — not a hobby project bar.
4. **Blast-radius boundary is non-negotiable:** Any finding related to the auto-healing boundary system must be escalated to 🔴 CRITICAL regardless of other context — this is the safety system that prevents AstraWatch from destroying customer infrastructure.
5. **Security findings are first-class:** Any finding with a security implication (auth bypass, data leakage, secret exposure) must be treated as 🔴 CRITICAL.
6. **Email notification completeness:** If the email notification system is missing or incomplete, this is a 🟠 HIGH finding — it is a core product promise.
7. **Do not recommend starting over.** AstraWatch has an existing codebase. Recommend targeted corrections. Only flag a complete rewrite of a specific file/service if there is no viable remediation path.

---

*This audit prompt was crafted for the AstraWatch project. Execute all phases completely before producing the final report.*
