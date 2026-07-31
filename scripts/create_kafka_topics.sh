#!/bin/bash
# Automatically create all required Kafka topics with retention and partition settings

KAFKA_BROKER=${KAFKA_BROKER:-"localhost:9092"}
TOPICS=(
  "raw-metrics"
  "raw-logs"
  "raw-traces"
  "anomaly-events"
  "incident-events"
  "healing-events"
)

echo "Creating Kafka topics on ${KAFKA_BROKER}..."

for topic in "${TOPICS[@]}"; do
  echo "Creating topic: ${topic}"
  docker exec kafka kafka-topics --create --if-not-exists \
    --bootstrap-server ${KAFKA_BROKER} \
    --topic ${topic} \
    --partitions 3 \
    --replication-factor 1 \
    --config retention.ms=86400000
done

echo "Kafka topics created successfully."
