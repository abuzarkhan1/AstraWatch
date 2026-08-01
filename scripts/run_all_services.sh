#!/usr/bin/env bash
# run_all_services.sh — Brings up AstraWatch infra + all seven services locally.
#
# Usage:
#   scripts/run_all_services.sh            # infra (docker compose) + all services
#   scripts/run_all_services.sh --infra    # infra only
#   scripts/run_all_services.sh --no-infra # services only (assumes infra is up)
#
# Requires:
#   - docker (for infra: postgres, kafka, clickhouse, redis, mailhog)
#   - Go, Java 17+/Maven, Python3+venv, Node 18+
#
# Environment (defaults are dev-safe; see .env.example for production):
#   JWT_SECRET  — must be >= 32 bytes and SHARED across services. Generated if unset.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 48 | tr -d '\n')}"

if [[ ${#JWT_SECRET} -lt 32 ]]; then
  echo "ERROR: JWT_SECRET must be at least 32 bytes" >&2
  exit 1
fi

echo "Using JWT_SECRET (${#JWT_SECRET} bytes) — export your own JWT_SECRET to keep sessions stable across restarts."

INFRA_ONLY=false
NO_INFRA=false
case "${1:-}" in
  --infra) INFRA_ONLY=true ;;
  --no-infra) NO_INFRA=true ;;
  "") ;;
  *) echo "Unknown argument: $1" >&2; exit 1 ;;
esac

if [[ "$NO_INFRA" != true ]]; then
  echo "── Infra (docker compose) ───────────────────────────────────"
  docker compose -f "${ROOT}/infra/docker/docker-compose.yml" up -d
  echo "  Waiting for Kafka, Postgres, ClickHouse, Redis..."
  # Give services a few seconds to become ready; individual services retry on their own.
  sleep 12
  "${ROOT}/scripts/create_kafka_topics.sh" || echo "  (topic creation skipped)"
fi

if [[ "$INFRA_ONLY" == true ]]; then
  echo "Infra up. Run 'scripts/run_all_services.sh --no-infra' to start services."
  exit 0
fi

PIDS=()

start_bg() {
  local name="$1"; shift
  echo "── Starting ${name} ────────────────────────────────────────"
  "$@" &
  PIDS+=($!)
}

# ── Collector (Go, :8080) ───────────────────────────────────────────
start_bg "collector" bash -c \
  "cd ${ROOT}/services/collector && PORT=8080 \
   KAFKA_BROKERS=localhost:9092 CLICKHOUSE_ADDR=localhost:9000 \
   REDIS_ADDR=localhost:6379 JWT_SECRET='${JWT_SECRET}' \
   INTERNAL_API_TOKEN='${INTERNAL_API_TOKEN:-internal-dev-token}' \
   go run ./cmd/collector"

# ── Orchestrator (Java, :8082) ──────────────────────────────────────
start_bg "orchestrator" bash -c \
  "cd ${ROOT}/services/orchestrator && JWT_SECRET='${JWT_SECRET}' \
   SPRING_DATASOURCE_URL='jdbc:postgresql://localhost:5432/astrawatch' \
   SPRING_KAFKA_BOOTSTRAP_SERVERS=localhost:9092 \
   mvn -q spring-boot:run"

# ── Analyzer (Python, :8000) ────────────────────────────────────────
start_bg "analyzer" bash -c \
  "cd ${ROOT}/services/analyzer && JWT_SECRET='${JWT_SECRET}' \
   KAFKA_BOOTSTRAP_SERVERS=localhost:9092 CLICKHOUSE_HOST=localhost \
   INTERNAL_API_TOKEN='${INTERNAL_API_TOKEN:-internal-dev-token}' \
   PYTHONPATH=. venv/bin/uvicorn app:app --host 0.0.0.0 --port 8000"

# ── Realtime (Node, :8084) ──────────────────────────────────────────
start_bg "realtime" bash -c \
  "cd ${ROOT}/services/realtime && JWT_SECRET='${JWT_SECRET}' PORT=8084 \
   REDIS_URL='redis://localhost:6379/0' KAFKA_BROKERS=localhost:9092 npm start"

# ── Payment (Go, :8085) ─────────────────────────────────────────────
start_bg "payment" bash -c \
  "cd ${ROOT}/services/payment-service && PORT=8085 JWT_SECRET='${JWT_SECRET}' \
   STRIPE_SECRET_KEY='${STRIPE_SECRET_KEY:-}' STRIPE_WEBHOOK_SECRET='${STRIPE_WEBHOOK_SECRET:-}' \
   go run ./cmd/server"

# ── Frontend (Vite, :5173) ──────────────────────────────────────────
start_bg "frontend" bash -c \
  "cd ${ROOT}/frontend && npm run dev"

echo ""
echo "All services launching. PIDs: ${PIDS[*]}"
echo "  Frontend:   http://localhost:5173"
echo "  Orches.:    http://localhost:8082"
echo "  Collector:  http://localhost:8080"
echo "  Analyzer:   http://localhost:8000"
echo "  Realtime:   :8084  |  Payment: :8085"
echo ""
echo "Press Ctrl-C to stop all services."
trap 'echo "Stopping all services..."; kill ${PIDS[*]} 2>/dev/null; exit 0' INT TERM
wait
