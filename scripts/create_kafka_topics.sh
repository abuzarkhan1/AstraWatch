#!/usr/bin/env bash
# create_kafka_topics.sh — Creates the Kafka topics AstraWatch services depend on.
# Requires a running Kafka broker (default localhost:9092). Override with KAFKA_BOOTSTRAP_SERVERS.
set -euo pipefailSCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

BOOTSTRAP="${KAFKA_BOOTSTRAP_SERVERS:-localhost:9092}"
REPLICATION="${KAFKA_REPLICATION_FACTOR:-1}"
PARTITIONS="${KAFKA_PARTITIONS:-3}"
COMPOSE_FILE="${KAFKA_COMPOSE_FILE:-${REPO_ROOT}/infra/docker/docker-compose.yml}"
KAFKA_SERVICE="${KAFKA_SERVICE:-kafka}"

TOPICS=(
  "raw-metrics"
  "raw-logs"
  "raw-traces"
  "anomaly-detected"
  "feedback-received"
  "healing-actions"
)

echo "Creating topics on ${BOOTSTRAP} (partitions=${PARTITIONS}, replication=${REPLICATION})..."

run_kafka_topics() {
  # Prefer a local CLI; otherwise exec into the compose service (which auto-names
  # the container, so we target it by service name, never a hardcoded container id).
  if command -v kafka-topics >/dev/null 2>&1; then
    kafka-topics --bootstrap-server "${BOOTSTRAP}" "$@"
  elif command -v docker >/dev/null 2>&1 && [ -f "${COMPOSE_FILE}" ]; then
    docker compose -f "${COMPOSE_FILE}" exec -T "${KAFKA_SERVICE}" kafka-topics --bootstrap-server "${BOOTSTRAP}" "$@"
  else
    echo "  ✗ No kafka-topics CLI or docker compose service '${KAFKA_SERVICE}' found"
    return 1
  fi
}

for topic in "${TOPICS[@]}"; do
  if run_kafka_topics --describe --topic "${topic}" >/dev/null 2>&1; then
    echo "  ✓ ${topic} already exists"
    continue
  fi

  if run_kafka_topics --create --topic "${topic}" --partitions "${PARTITIONS}" --replication-factor "${REPLICATION}"; then
    echo "  ✓ ${topic} created"
  else
    echo "  ✗ ${topic} could not be created"
  fi
done

echo "Done. Topics: ${TOPICS[*]}"
