.PHONY: all build test dev clean

all: build

build:
	@echo "Building all services..."
	cd services/collector && go build ./...
	cd services/operator && go build ./...
	cd services/payment-service && go build ./...
	cd services/orchestrator && mvn compile -q
	cd services/realtime && npm install --no-optional && node --check src/server.js
	cd frontend && npm install --no-optional && npx tsc --noEmit
	cd services/analyzer && venv/bin/python3 -m py_compile app/**/*.py
	command -v cmake >/dev/null 2>&1 && (cd services/cxx-agent && mkdir -p build && cd build && cmake .. && make) || echo "cmake not found on host, skipping C++ agent native build (Docker build available in Dockerfile.cxx-agent)"
	@echo "All services built successfully"

test:
	@echo "Running tests..."
	cd services/collector && go test ./... -v -count=1
	cd services/operator && go test ./... -v -count=1
	cd services/payment-service && go test ./... -v -count=1
	cd services/orchestrator && mvn test -q
	cd services/analyzer && ( [ -d "venv" ] && PYTHONPATH=. venv/bin/python3 -m unittest discover -s tests || PYTHONPATH=. python3 -m unittest discover -s tests )
	cd services/realtime && npm test
	cd frontend && npm test
	command -v cmake >/dev/null 2>&1 && (cd services/cxx-agent && mkdir -p build && cd build && cmake .. && make && ctest) || echo "cmake not found on host, skipping C++ agent test (Docker container build available)"
	./tests/integration_test.sh

dev:
	docker compose -f infra/docker/docker-compose.yml up -d

dev-down:
	docker compose -f infra/docker/docker-compose.yml down

clean:
	cd services/orchestrator && mvn clean
	rm -rf frontend/node_modules frontend/dist
	rm -rf services/realtime/node_modules
	rm -rf services/analyzer/venv
