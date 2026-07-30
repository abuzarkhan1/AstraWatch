-- AstraWatch ClickHouse Initialization
CREATE DATABASE IF NOT EXISTS astrawatch;

CREATE TABLE IF NOT EXISTS astrawatch.metrics (
    service_id String,
    metric_name String,
    ts DateTime64(3),
    value Float64,
    labels Map(String, String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(ts)
ORDER BY (service_id, metric_name, ts);

CREATE TABLE IF NOT EXISTS astrawatch.logs (
    service_id String,
    timestamp DateTime64(3),
    level String,
    message String,
    trace_id String,
    span_id String,
    attributes Map(String, String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service_id, level, timestamp);
