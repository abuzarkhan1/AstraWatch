#!/bin/bash
# integration_test.sh — Smoke-test the AstraWatch services on their real ports.
#
# Ports (see scripts/run_all_services.sh):
#   Collector    :8080   Orchestrator :8082   Analyzer :8000
#   Realtime     :8084   Payment      :8085   Frontend :5173
set -uo pipefail

echo "Running integration tests..."

# Collector ingest + health endpoints
echo "Testing Collector endpoints..."
curl -s -o /dev/null -w "collector /v1/health -> %{http_code}\n" http://localhost:8080/v1/health || echo "Collector health offline"
curl -s -o /dev/null -w "collector ingest metrics -> %{http_code}\n" -X POST http://localhost:8080/v1/ingest/metrics/batch \
  -H "Content-Type: application/json" -H "Authorization: Bearer test-token-placeholder" -d '[]' || echo "Collector metrics offline"

# Analyzer endpoints
echo "Testing Analyzer endpoints..."
curl -s -o /dev/null -w "analyzer /healthz -> %{http_code}\n" http://localhost:8000/healthz || echo "Analyzer offline"
curl -s -o /dev/null -w "analyzer root-cause -> %{http_code}\n" -X POST http://localhost:8000/v1/anomaly/root-cause \
  -H "Content-Type: application/json" -d '{"serviceId":"payment","incidentId":"inc-1"}' || echo "Analyzer root-cause offline"

# Orchestrator endpoints
echo "Testing Orchestrator endpoints..."
curl -s -o /dev/null -w "orchestrator /api/v1/health -> %{http_code}\n" http://localhost:8082/api/v1/health || echo "Orchestrator offline"
curl -s -o /dev/null -w "orchestrator login -> %{http_code}\n" -X POST http://localhost:8082/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"email":"admin@astrawatch.io","password":"Admin@12345"}' || echo "Orchestrator login offline"

# Payment health
echo "Testing Payment endpoint..."
curl -s -o /dev/null -w "payment /healthz -> %{http_code}\n" http://localhost:8085/healthz || echo "Payment offline"

# Realtime health (HTTP health endpoint, not a raw WS upgrade)
echo "Testing Realtime endpoint..."
curl -s -o /dev/null -w "realtime /healthz -> %{http_code}\n" http://localhost:8084/healthz || echo "Realtime offline"

# Frontend
echo "Testing Frontend..."
curl -s -o /dev/null -w "frontend / -> %{http_code}\n" http://localhost:5173/ || echo "Frontend offline"

echo "Integration testing complete."
