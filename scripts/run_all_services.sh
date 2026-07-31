#!/usr/bin/env bash
set -e

PROJECT_ROOT="/Users/abuzar/Desktop/Astrawatch"

echo "========================================================"
echo "🚀 AstraWatch — Starting All Microservices in Terminal Tabs"
echo "========================================================"

# Check Docker Infrastructure status
echo "Checking Docker infrastructure data stores..."
docker compose -f "${PROJECT_ROOT}/infra/docker/docker-compose.yml" up -d

# Define microservices to launch
SERVICES=(
  "Collector:${PROJECT_ROOT}/services/collector:go run cmd/collector/main.go"
  "Analyzer:${PROJECT_ROOT}/services/analyzer:PYTHONPATH=. venv/bin/python3 -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload"
  "Orchestrator:${PROJECT_ROOT}/services/orchestrator:mvn spring-boot:run"
  "Realtime:${PROJECT_ROOT}/services/realtime:npm run dev"
  "Operator:${PROJECT_ROOT}/services/operator:go run cmd/manager/main.go"
  "Frontend:${PROJECT_ROOT}/frontend:npm run dev"
)

# Open each service in a new Terminal window or tab on macOS
for SERVICE in "${SERVICES[@]}"; do
  IFS=":" read -r TITLE DIR CMD <<< "$SERVICE"
  echo "Opening Terminal tab for: ${TITLE}..."
  osascript -e "tell application \"Terminal\" to do script \"cd '${DIR}' && echo '=== 🚀 AstraWatch: ${TITLE} ===' && ${CMD}\""
  sleep 1
done

echo "========================================================"
echo "✅ All 6 microservices have been launched in separate Terminal tabs!"
echo "========================================================"
