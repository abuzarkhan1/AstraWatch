#!/bin/bash

echo "Running integration tests..."

# Collector ingest endpoints
echo "Testing Collector endpoints..."
curl -s -X POST http://localhost:8081/v1/ingest/metrics/batch -H "Content-Type: application/json" -d '[]' || echo "Collector metrics offline"
curl -s -X POST http://localhost:8081/v1/ingest/logs -H "Content-Type: application/json" -d '[]' || echo "Collector logs offline"

# Analyzer endpoints
echo "Testing Analyzer endpoints..."
curl -s -X POST http://localhost:8082/v1/anomaly/root-cause -H "Content-Type: application/json" -d '{}' || echo "Analyzer offline"

# Orchestrator endpoints
echo "Testing Orchestrator endpoints..."
curl -s -X POST http://localhost:8080/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"test","password":"password"}' || echo "Orchestrator offline"
curl -s -X POST http://localhost:8080/api/v1/incidents -H "Content-Type: application/json" -d '{}' || echo "Orchestrator incidents offline"

# Realtime WebSocket endpoint
echo "Testing Realtime WebSocket endpoint..."
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Host: localhost:3001" -H "Origin: http://localhost:3001" http://localhost:3001/ 2>/dev/null || echo "Realtime offline"

echo "Integration testing complete."
