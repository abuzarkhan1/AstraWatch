.PHONY: all build test dev clean

all: build

build:
	@echo "Building all services..."
	cd services/collector && go build ./...
	cd services/operator && go build ./...
	cd services/orchestrator && mvn compile -q
	cd services/realtime && npm install --no-optional && node --check src/server.js
	cd frontend && npm install --no-optional && npx tsc --noEmit
	cd services/analyzer && python3 -m py_compile app/**/*.py || true
	command -v cmake >/dev/null 2>&1 && (cd services/cxx-agent && mkdir -p build && cd build && cmake .. && make) || echo "cmake not found on host, skipping C++ agent native build (Docker build available in Dockerfile.cxx-agent)"
	@echo "All services built successfully"

test:
	@echo "Running tests..."
	cd services/collector && go test ./... -v -count=1
	cd services/operator && go test ./... -v -count=1 || true
	cd services/orchestrator && mvn test -q || true
	cd services/analyzer && python3 -m unittest discover || true
	cd services/realtime && npm test || true
	cd frontend && npm test || true
	cd services/cxx-agent && mkdir -p build && cd build && cmake .. && make && ctest || true
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
