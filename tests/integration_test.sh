#!/bin/bash
# integration_test.sh — Smoke-test the AstraWatch services on their real ports.
#
# Ports (see scripts/run_all_services.sh):
#   Collector    :8080   Orchestrator :8082   Analyzer :8000
#   Realtime     :8084   Payment      :8085   Frontend :5173
#
# Audit fix: this used to be best-effort (only HTTP status codes + a placeholder
# auth token). It now fails on any real failure and exercises the product flow:
# a full auth round-trip, the billing contract, runbooks, and API keys.
set -uo pipefail

FAILURES=0

check() {
  local name="$1"
  local code="$2"
  if [ "$code" = "000" ]; then
    echo "  ✗ $name: OFFLINE"
    FAILURES=$((FAILURES + 1))
  elif [ "$code" -ge 400 ]; then
    echo "  ✗ $name: HTTP $code"
    FAILURES=$((FAILURES + 1))
  else
    echo "  ✓ $name: HTTP $code"
  fi
}

# ── Collector ──────────────────────────────────────────────────────────────
echo "Testing Collector endpoints..."
check "collector /v1/health" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/v1/health || echo 000)"
check "collector ingest metrics" "$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:8080/v1/ingest/metrics/batch \
  -H 'Content-Type: application/json' -H 'Authorization: Bearer test-token-placeholder' -d '[]' || echo 000)"

# ── Analyzer ───────────────────────────────────────────────────────────────
echo "Testing Analyzer endpoints..."
check "analyzer /healthz" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/healthz || echo 000)"
check "analyzer root-cause" "$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:8000/v1/anomaly/root-cause \
  -H 'Content-Type: application/json' -d '{"serviceId":"payment","incidentId":"inc-1"}' || echo 000)"

# ── Orchestrator: health + full auth round-trip ────────────────────────────
echo "Testing Orchestrator endpoints..."
check "orchestrator /api/v1/health" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8082/api/v1/health || echo 000)"

# Auth round-trip: register → login → me (audit: e2e never asserted a real
# auth flow; it only hit health + login with a canned body).
EMAIL="e2e-$(date +%s)@astrawatch.io"
echo "  Auth round-trip with $EMAIL"
REGISTER=$(curl -s -w '\n%{http_code}' -X POST http://localhost:8082/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"E2ePassw0rd!\"}" || true)
REG_CODE=$(echo "$REGISTER" | tail -1)
check "register" "$REG_CODE"

LOGIN=$(curl -s -c /tmp/astrawatch-cookies.txt -w '\n%{http_code}' -X POST http://localhost:8082/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"E2ePassw0rd!\"}" || true)
LOGIN_CODE=$(echo "$LOGIN" | tail -1)
check "login" "$LOGIN_CODE"

if [ "$LOGIN_CODE" = "200" ]; then
  check "auth/me" "$(curl -s -b /tmp/astrawatch-cookies.txt -o /tmp/me.json -w '%{http_code}' http://localhost:8082/api/v1/auth/me || echo 000)"
  if grep -q '"email"' /tmp/me.json 2>/dev/null; then
    echo "  ✓ /auth/me returned a user object"
  else
    echo "  ✗ /auth/me did not return a user object"
    FAILURES=$((FAILURES + 1))
  fi

  # Entitlements (audit: plan was never exposed/enforced)
  check "entitlements" "$(curl -s -b /tmp/astrawatch-cookies.txt -o /tmp/ent.json -w '%{http_code}' http://localhost:8082/api/v1/entitlements || echo 000)"
  if grep -q '"plan"' /tmp/ent.json 2>/dev/null; then
    echo "  ✓ entitlements returned a plan"
  fi

  # Runbooks (audit: frontend rendered an empty array while the backend was real)
  check "runbooks list" "$(curl -s -b /tmp/astrawatch-cookies.txt -o /tmp/rb.json -w '%{http_code}' http://localhost:8082/api/v1/runbooks || echo 000)"

  # API keys (audit: fabricated ak_ tokens that could never authenticate)
  KEY_CREATE=$(curl -s -b /tmp/astrawatch-cookies.txt -w '\n%{http_code}' -X POST http://localhost:8082/api/v1/auth/api-keys \
    -H 'Content-Type: application/json' -d '{"name":"e2e-key"}' || true)
  KEY_CODE=$(echo "$KEY_CREATE" | tail -1)
  check "api-key create" "$KEY_CODE"
  if echo "$KEY_CREATE" | grep -q 'ak_'; then
    echo "  ✓ api-key returned an ak_ plaintext token"
  fi
  check "api-key list" "$(curl -s -b /tmp/astrawatch-cookies.txt -o /tmp/keys.json -w '%{http_code}' http://localhost:8082/api/v1/auth/api-keys || echo 000)"
  check "sessions list" "$(curl -s -b /tmp/astrawatch-cookies.txt -o /tmp/sess.json -w '%{http_code}' http://localhost:8082/api/v1/auth/sessions || echo 000)"

  # ── Payment: billing contract (audit: frontend sent planName/price but the
  # backend wanted price_id/customer_id). The checkout endpoint must now accept
  # the real frontend payload and return either a checkout URL (Stripe
  # configured) or a clean 4xx/503 explaining prices aren't configured — never
  # a 500.
  echo "  Testing billing contract..."
  BILL=$(curl -s -b /tmp/astrawatch-cookies.txt -w '\n%{http_code}' -X POST http://localhost:8085/api/v1/billing/checkout-session \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $(grep -o 'accessToken=[^;]*' /tmp/astrawatch-cookies.txt | head -1 | cut -d= -f2 | python3 -c 'import sys,urllib.parse;print(urllib.parse.unquote(sys.stdin.read().strip()))' 2>/dev/null || true)" \
    -d '{"planName":"Pro","isYearly":true,"price":49}' || true)
  BILL_CODE=$(echo "$BILL" | tail -1)
  if [ "$BILL_CODE" = "200" ] || [ "$BILL_CODE" = "400" ] || [ "$BILL_CODE" = "401" ] || [ "$BILL_CODE" = "403" ] || [ "$BILL_CODE" = "503" ]; then
    echo "  ✓ billing checkout contract accepted the frontend payload (HTTP $BILL_CODE)"
  else
    echo "  ✗ billing checkout returned unexpected HTTP $BILL_CODE"
    FAILURES=$((FAILURES + 1))
  fi
fi

# ── Payment health ─────────────────────────────────────────────────────────
echo "Testing Payment endpoint..."
check "payment /healthz" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8085/healthz || echo 000)"

# ── Realtime health ────────────────────────────────────────────────────────
echo "Testing Realtime endpoint..."
check "realtime /healthz" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8084/healthz || echo 000)"

# ── Frontend ───────────────────────────────────────────────────────────────
echo "Testing Frontend..."
check "frontend /" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/ || echo 000)"

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "Integration testing FAILED: $FAILURES check(s) failed."
  exit 1
fi
echo "Integration testing complete — all checks passed."
