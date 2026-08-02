# Missing Points — Deep Audit & Implementation Plan

> **Purpose:** Everything found missing, broken, or stubbed across the AstraWatch codebase, with a
> concrete, ordered implementation plan. Every item below is a genuine gap verified against the
> actual source, not a guess.
>
> Legend: 🔴 BLOCKER (product cannot work without it) · 🟠 HIGH (breaks a real flow) · 🟡 MEDIUM (robustness/security) · 🟢 LOW (polish)

---

## Part 1 — Payment Gateway & Subscriptions (audited first, per request)

### Verdict
**Not working end-to-end today. Not production-ready.** The payment-service skeleton is solid
(JWT-protected endpoints, Stripe webhook signature verification, Postgres-backed subscription store
with in-memory fallback), but the product flow is broken in four connected places. Clicking
"Subscribe" today fails 100% of the time.

### 1.1 🔴 Contract mismatch between frontend and backend
- **Frontend sends** (`frontend/src/components/ui/pricing-section-4.tsx` → `frontend/src/lib/api.ts`):
  ```json
  { "planName": "Starter", "isYearly": false, "price": 19 }
  ```
- **Backend requires** (`services/payment-service/internal/handlers/billing.go`, `CheckoutRequest`):
  ```json
  { "price_id": "price_xxx", "customer_id": "cus_xxx", "success_url": "...", "cancel_url": "..." }
  ```
- **Result:** every checkout sends empty `price_id` (→ Stripe `No such price: ''`) and empty
  `customer_id` (→ Stripe `No such customer: ''`).
- **Why tests pass while the product is broken:** `billing_test.go` POSTs a body the real frontend
  never sends. The tests validate a contract that doesn't exist in the product.

### 1.2 🔴 No Stripe Price IDs defined anywhere
- `price: 19` is a dollar amount; Stripe needs **Price IDs** (`price_abc123`) created in the Stripe
  Dashboard. `grep -rn 'price_'` across the repo finds **zero** Price ID constants.
- No yearly prices either — the `isYearly` toggle is silently ignored by the backend (no interval
  param in `CreateCheckoutSession`).

### 1.3 🔴 No Stripe Customer creation
- Nothing anywhere calls Stripe's customer-create API. `customer_id` is client-supplied; Stripe
  portal + subscriptions both require a real `cus_*` object.

### 1.4 🔴 "Manage subscriptions" UI is non-functional
- `api.ts`: `createPortalSession: () => api.post(...)` — **sends no body**, so the backend's
  `customer_id` is empty and portal fails.
- `GET /api/v1/billing/subscriptions?customer_id=` requires a `customer_id` the frontend never passes.
- No "Manage plan / Billing" screen exists — the pricing page is the only billing UI and its buttons 500.

### 1.5 🔴 No entitlement enforcement / no propagation to orchestrator
- Even a successful checkout would only write to the payment service's own Postgres table.
- **Nothing notifies the orchestrator** (no Kafka event, no API call) → a user's plan never changes.
- **No feature anywhere checks the plan.** A "subscription" gates nothing.

### 1.6 🟠 IDOR on subscriptions/portal
- `subscriptions` / `portal` trust the client-supplied `customer_id` without verifying it against
  the JWT `sub`. Any authenticated user could read another customer's subscriptions.

### 1.7 🟡 Secondary gaps
- Missing `invoice.payment_failed` webhook handling (no dunning / churn detection) — only
  `payment_succeeded` is handled.
- Missing success/cancel URLs from the frontend → even a successful response would
  `window.location.href = ""`.
- Inconsistent response shapes: success path returns `[]*stripe.Subscription`, webhook-cache path
  returns a different map shape.
- Local dev requires real `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` (or `stripe listen` for
  webhooks); service boots without them but every Stripe call fails.

### Implementation plan for Part 1
1. Add `price_id` (monthly + yearly per plan) mapping to payment-service config; define Price IDs in Stripe Dashboard (test mode).
2. Add Stripe customer create/lookup keyed by user id (lazy on first checkout); store mapping.
3. Fix frontend checkout payload to send `price_id`, `customer_id`, `success_url`, `cancel_url`.
4. Fix `api.ts` portal call to send the user's `customer_id`; add a real Manage Billing page.
5. On webhook, publish `billing.plan_changed` to Kafka; orchestrator consumer updates user plan.
6. Add entitlement middleware (collector / orchestrator) that reads plan and enforces limits.
7. Bind `customer_id` to JWT `sub` on subscriptions/portal endpoints.
8. Handle `invoice.payment_failed` (store status, optionally notify user).

---

## Part 2 — Frontend pages that render empty/stub data (no real API wiring)

### 2.1 🔴 Runbooks — empty array, backend exists but never called
- `frontend/src/features/runbooks/RunbooksPage.tsx:18` — `const sampleRunbooks: Runbook[] = []` —
  **hardcoded empty**. The "New Runbook" button does nothing. Search filters an empty array.
- `frontend/src/lib/api.ts` — **zero `runbook` endpoints** (grep: no match).
- **Backend is fully implemented and ignored:** `RunbookController` (`/api/v1/runbooks`) has
  GET/POST/PUT, `/{id}/versions`, `/{id}/execute`, `/{id}/executions`, backed by real JPA repos.
- **Fix:** add `runbooks` endpoints to `api.ts`, wire `RunbooksPage` to `useQuery`, implement the
  create/execute/version UI.

### 2.2 🔴 Postmortems — empty array, backend exists but never called
- `frontend/src/features/postmortems/PostmortemsPage.tsx:9` — `const samplePostmortems: any[] = []`.
  Stats cards render `0` always.
- `frontend/src/lib/api.ts` — **zero `postmortem` endpoints**.
- **Backend implemented and ignored:** `PostmortemController` (`/api/v1/incidents/{id}/postmortem`)
  has POST/GET/PUT, `/export`, `/action-items` (GET/POST).
- **Fix:** add `postmortems` endpoints to `api.ts`, wire the page, add create/export/action-item UI.

### 2.3 🔴 Alerting Center — hardcoded TODO stub
- `frontend/src/features/alerting/AlertingCenterPage.tsx` — the query function literally returns
  `{ items: [] }` with the comment `// TODO: Fetch from actual alerting endpoint when available`.
  "New Rule" / "Create your first rule" buttons do nothing. Toggle only mutates local state.
- `frontend/src/lib/api.ts` — **no alert-rules endpoints** (grep: no match).
- **Fix:** add alert-rules endpoints (orchestrator `NotificationController` `/rules` exists but the
  UI needs a matching contract), wire CRUD + toggle via API.

### 2.4 🟡 Status Page — hardcoded empty + dead button
- `frontend/src/features/status-page/StatusPage.tsx` — `uptimeCategories: any[] = []` (hardcoded
  empty), "Public Status Page" button has no `onClick`/href. Status is derived from `useServices()`
  only — no incidents feed, no uptime history.
- Backend `StatusPageController` exists (`/api/v1/status-page`, components/subscribers/maintenance)
  but `api.ts` has **no status-page endpoints**.
- **Fix:** add status-page endpoints, render real components + incident feed, link a real public page.

### 2.5 🟡 SLO page — fabricates numbers when API returns nothing
- `frontend/src/features/slo/SLOPage.tsx` — `sloTargets: Record<string, number> = {}` and
  `current = sloData?.current ?? svc.sloAttainment ?? svc.healthScore ?? target - 0.3` — invents
  attainment when the backend has none. burnRate defaults to `0.5`.
- **Fix:** when `sloData` is null show a clear "No SLO defined" state instead of fabricated metrics.

### 2.6 🟡 New auth/API-key/session endpoints defined but never used in the UI
- `api.ts` defines `acceptInvite`, `createApiKey`, `listApiKeys`, `revokeApiKey`, `sessions`,
  `terminateSession`, `changePassword`, `resetPassword`, `verifyEmail` — grep across all `.tsx`
  shows **zero callers** except `forgotPassword` (see below).
- **Fix:** build a Settings page (API keys + active sessions + terminate), wire invite acceptance,
  add verify-email / reset-password / change-password screens.

### 2.7 🟢 ForgotPassword swallows errors
- `frontend/src/features/auth/ForgotPasswordPage.tsx:30-31` — `await endpoints.auth.forgotPassword({ email }).catch(() => {})` — always shows success even on failure, and there's no reset-password page wired to the emailed token.

---

## Part 3 — Orchestrator backend stubs and dead endpoints

### 3.1 🔴 `CatalogController` returns a hardcoded empty list
- `services/orchestrator/.../web/CatalogController.java` — the ONLY endpoint
  `GET /api/v1/catalog/services` returns `ApiResponse.ok(List.of())` — **always empty**. The real
  catalog lives in the collector (`/api/v1/catalog`, backed by ingested telemetry).
- **Fix:** delete the orchestrator stub or forward to the collector; keep a single source of truth.

### 3.2 🟠 GitHub auto-PR writes a placeholder patch
- `services/orchestrator/.../event/AnomalyEventConsumer.java:149` — comment:
  *"enabling auto-pr today writes a placeholder patch — keep the flag off until..."* — the
  auto-healing PR path is disabled by flag and, when enabled, produces a placeholder patch rather
  than a real diff from the analyzer's evidence.
- **Fix:** implement the real patch generation (diff from root-cause + runbook steps) and only then
  flip the flag default on.

### 3.3 🟡 `NotificationController.testChannel` returns a fake success
- `NotificationController` — `testChannel` returns `Map.of("delivered", true, "responseCode", 200)`
  unconditionally (no actual delivery attempted).
- **Fix:** send a real test message through the channel adapter and return the real result.

### 3.4 🟡 `StatusPageController` incidents feed hardcoded empty
- `StatusPageController.getStatusPage` returns `"incidents", List.of()` — never reads the incident
  repository.
- **Fix:** populate from `IncidentRepository` (active + past 90 days).

### 3.5 🟡 `EscalationPolicyController.resolveStep` / on-call compute — verify real vs mock
- OnCall/Escalation controllers read from JPA repos (real), but the *resolution logic* (who gets
  paged next, time-to-escalate) should be audited against the plan — no end-to-end test exercises it.

---

## Part 4 — Orchestration gap: the auto-healing operator never runs

### 4.1 🔴 Operator missing from docker-compose AND run_all_services.sh
- `infra/docker/docker-compose.yml` — service list: zookeeper, kafka, postgres, clickhouse, redis,
  mailhog, collector, orchestrator, analyzer, realtime, payment, frontend. **`operator` is NOT in
  compose.**
- `scripts/run_all_services.sh` — grep `operator`: **not found**. The operator is only startable
  manually via `go run ./cmd/manager`.
- **Consequence:** the healing loop (`healing-actions` Kafka consumer → `ActionExecutor` → resource
  mutation → result publish) **never executes** in any local/CI run. The whole auto-healing feature
  is dead in practice even though the code compiles.
- **Fix:** add an `operator` service to compose (with `KUBECONFIG`/dry-run env) and a `start_bg
  "operator"` block in `run_all_services.sh`.

### 4.2 🟡 cxx-agent missing from compose and CI
- `Dockerfile.cxx-agent` exists but no compose service, and CI has **no cxx/cmake job** (grep: no
  match) — `services/cxx-agent/test/ring_buffer_test.cpp` is never built or run anywhere.
- **Fix:** add a compose service (or at least a CI job) that builds with CMake and runs the unit test.

---

## Part 5 — Infra / deployment gaps

### 5.1 🟠 Helm charts missing entirely
- The file tree lists `infra/helm/` with 6 charts, but `ls infra/helm` → **No such file or
  directory** (only `infra/terraform/` exists). No `Chart.yaml` anywhere in the repo.
- **Fix:** re-add the helm charts (frontend, collector, realtime, analyzer, operator, orchestrator)
  or remove them from the docs — currently the deployment story is only Terraform for infra stores.

### 5.2 🟡 Terraform covers only data stores
- `infra/terraform/`: `main.tf`, `postgres.tf`, `kafka.tf`, `redis.tf`, `clickhouse.tf` — **no app
  services** (collector/orchestrator/analyzer/realtime/operator/payment/frontend).
- **Fix:** add Terraform (or the Helm charts from 5.1) for the application services so
  infra-as-code deploys the product, not just the stores.

### 5.3 🟡 CI e2e is best-effort
- `.github/workflows/ci.yml` e2e job runs `./tests/integration_test.sh || true` — failures are
  ignored by design; the note says failures are "inspected via logs".
- `tests/integration_test.sh` uses `Authorization: Bearer test-token-placeholder` for the collector
  (fine — those routes are auth-bypassed) but the e2e never asserts a real auth flow or a real
  checkout.
- **Fix:** fail the job on integration-test failure; add an auth round-trip (register → login → me)
  and a billing contract assertion.

### 5.4 🟢 Operator/payment env in compose
- Compose sets `JWT_SECRET`/`INTERNAL_API_TOKEN` for app services, but payment-service also needs
  `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` (currently empty-passed) for any real checkout —
  document + wire a test-mode setup (see Part 1 plan).

---

## Part 6 — Tests that don't test the product

### 6.1 🔴 `billing_test.go` validates a contract the frontend never sends
- Covered in 1.1. The mock-client tests POST `price_id`/`customer_id` while the real app sends
  `planName`/`price` — green CI, broken product.

### 6.2 🟡 `cxx-agent` unit test never runs
- `services/cxx-agent/test/ring_buffer_test.cpp` exists; no CI job or Makefile target builds/runs it.

### 6.3 🟡 Integration test breadth
- `tests/integration_test.sh` only checks HTTP status codes of health endpoints + login. It never
  exercises: ingest → query round-trip, anomaly detect, healing trigger, WebSocket connect, or
  invite/API-key flows.

---

## Consolidated Implementation Plan (ordered)

### Phase A — Make the product flow work (blockers)
1. **Billing contract fix** (Part 1.1–1.4): define plan→price mapping + Stripe customer create/lookup; fix `pricing-section-4.tsx` and `api.ts` payloads; add a Manage Billing page; bind `customer_id` to JWT `sub`.
2. **Entitlements** (Part 1.5): publish `billing.plan_changed` to Kafka on webhook; orchestrator consumer updates user plan; add plan checks in collector/orchestrator.
3. **Start the operator** (Part 4.1): add operator to compose + `run_all_services.sh`; verify healing consumer connects to Kafka.
4. **Wire the three dead pages** (Part 2.1–2.3): runbooks, postmortems, alerting — add `api.ts` endpoints, replace empty arrays with `useQuery`, implement CRUD UI.

### Phase B — Close the stub endpoints (high)
5. Delete or forward orchestrator `CatalogController` (3.1).
6. Real GitHub auto-PR patch generation (3.2).
7. Real `testChannel` delivery + `StatusPageController` incident feed (3.3–3.4).
8. Status page + SLO honest empty-states (2.4–2.5).

### Phase C — Build the missing product surfaces (high/medium)
9. Settings page: API keys (create/list/revoke), active sessions (list/terminate), invite acceptance (2.6).
10. Auth completion: verify-email, reset-password, change-password screens (2.6–2.7).
11. Public status page (2.4).

### Phase D — Deployment & CI honesty (medium)
12. Restore Helm charts or remove from docs (5.1); add app-service Terraform/Helm (5.2).
13. Add cxx-agent to CI (build + ring-buffer test) and compose (4.2, 6.2).
14. Make CI e2e fail on integration failure; add auth + billing round-trip assertions (5.3, 6.3).
15. Stripe test-mode env wiring + `stripe listen` docs (5.4).

### Phase E — Verification per item
- Go: `go build ./... && go vet ./... && go test ./... -count=1` (collector, operator, payment).
- Java: `mvn -q test` (orchestrator).
- Python: `python -m py_compile` + `unittest discover` (analyzer).
- Node: `node --check` + `npm test` (realtime), `npx tsc --noEmit` + `npm run build` (frontend).
- E2E: `docker compose up -d --build` + `tests/integration_test.sh` (no `|| true`).
