-- AstraWatch ClickHouse Initialization
-- Column sets here MUST match the collector consumer's INSERT column lists
-- (services/collector/internal/consumer/consumer.go), otherwise every batch
-- insert fails at runtime (audit F8 / schema-drift fix).
-- tenant_id is stored on every row so query endpoints can enforce tenant
-- isolation (audit V5 — a user must never read another tenant's data).

CREATE DATABASE IF NOT EXISTS astrawatch;

-- Raw metrics (consumer: tenant_id, service_id, cluster, namespace, metric_name, ts, value, labels)
CREATE TABLE IF NOT EXISTS astrawatch.metrics (
    tenant_id String,
    service_id String,
    cluster String,
    namespace String,
    metric_name String,
    ts DateTime64(3),
    value Float64,
    labels Map(String, String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(ts)
ORDER BY (tenant_id, service_id, metric_name, ts)
-- Raw rows age out after 30 days; long-range dashboards read the rollups below.
TTL ts + INTERVAL 30 DAY;

-- Raw logs (consumer: tenant_id, service_id, cluster, namespace, ts, level, message, trace_id, span_id, attributes)
CREATE TABLE IF NOT EXISTS astrawatch.logs (
    tenant_id String,
    service_id String,
    cluster String,
    namespace String,
    ts DateTime64(3),
    level String,
    message String,
    trace_id String,
    span_id String,
    attributes Map(String, String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(ts)
ORDER BY (tenant_id, service_id, ts)
-- Raw log retention: 30 days (compliance window is served by the rollups).
TTL ts + INTERVAL 30 DAY;

-- Raw traces (consumer: tenant_id, trace_id, span_id, parent_span_id, service_id, operation_name, start_time, end_time, tags)
CREATE TABLE IF NOT EXISTS astrawatch.traces (
    tenant_id String,
    trace_id String,
    span_id String,
    parent_span_id String,
    service_id String,
    operation_name String,
    start_time DateTime64(3),
    end_time DateTime64(3),
    tags Map(String, String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(start_time)
ORDER BY (tenant_id, service_id, start_time)
TTL start_time + INTERVAL 30 DAY;

-- ── Downsampling pipeline (audit Phase 7) ─────────────────────────────────
-- 1-minute and 5-minute rollups are fed by materialized views so long-range
-- dashboards never scan raw rows. tenant_id is preserved in every rollup so
-- per-tenant dashboards never leak across tenants.

CREATE TABLE IF NOT EXISTS astrawatch.metrics_1m (
    tenant_id String,
    service_id String,
    metric_name String,
    bucket DateTime,
    sum_value Float64,
    min_value Float64,
    max_value Float64,
    count_value UInt64
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(bucket)
ORDER BY (tenant_id, service_id, metric_name, bucket)
-- 1-minute rollups serve 30–90 day windows, then age out.
TTL bucket + INTERVAL 90 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS astrawatch.metrics_1m_mv
TO astrawatch.metrics_1m AS
SELECT
    tenant_id,
    service_id,
    metric_name,
    toStartOfMinute(ts) AS bucket,
    sum(value) AS sum_value,
    min(value) AS min_value,
    max(value) AS max_value,
    count() AS count_value
FROM astrawatch.metrics
GROUP BY tenant_id, service_id, metric_name, bucket;

CREATE TABLE IF NOT EXISTS astrawatch.metrics_5m (
    tenant_id String,
    service_id String,
    metric_name String,
    bucket DateTime,
    sum_value Float64,
    min_value Float64,
    max_value Float64,
    count_value UInt64
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(bucket)
ORDER BY (tenant_id, service_id, metric_name, bucket)
-- 5-minute rollups are the long-term store (up to a year).
TTL bucket + INTERVAL 365 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS astrawatch.metrics_5m_mv
TO astrawatch.metrics_5m AS
SELECT
    tenant_id,
    service_id,
    metric_name,
    toStartOfInterval(ts, INTERVAL 5 MINUTE) AS bucket,
    sum(value) AS sum_value,
    min(value) AS min_value,
    max(value) AS max_value,
    count() AS count_value
FROM astrawatch.metrics
GROUP BY tenant_id, service_id, metric_name, bucket;

-- 5-minute error-count rollup per service for trend dashboards.
CREATE TABLE IF NOT EXISTS astrawatch.log_errors_5m (
    tenant_id String,
    service_id String,
    bucket DateTime,
    level String,
    error_count UInt64
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(bucket)
ORDER BY (tenant_id, service_id, bucket)
TTL bucket + INTERVAL 365 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS astrawatch.log_errors_5m_mv
TO astrawatch.log_errors_5m AS
SELECT
    tenant_id,
    service_id,
    toStartOfInterval(ts, INTERVAL 5 MINUTE) AS bucket,
    level,
    count() AS error_count
FROM astrawatch.logs
WHERE level IN ('error', 'fatal', 'critical')
GROUP BY tenant_id, service_id, bucket, level;
