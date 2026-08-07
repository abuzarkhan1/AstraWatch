-- AstraWatch Schema V14 — SLOs keyed by service name.
-- The collector catalog exposes services by their telemetry id (e.g.
-- "payment-api"), not a UUID. SLO definitions now carry an optional
-- service_key so the SLO page can resolve a real SLO for any catalog service.
ALTER TABLE slo_definitions ADD COLUMN IF NOT EXISTS service_key VARCHAR(128);
CREATE INDEX IF NOT EXISTS idx_slo_definitions_service_key ON slo_definitions(service_key);
