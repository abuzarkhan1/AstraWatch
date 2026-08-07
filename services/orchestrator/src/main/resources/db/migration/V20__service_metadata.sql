-- V20: service catalog metadata (audit: the Catalog page rendered language/tags
-- conditionally but the backend never returned them — the services table had no
-- such columns, so cards silently dropped those rows). Adds the columns the
-- catalog card actually displays, plus a service_key mirror so telemetry lookup
-- can use the collector's slug keys (payment-api) instead of the UUID.
ALTER TABLE services ADD COLUMN IF NOT EXISTS language VARCHAR(60);
ALTER TABLE services ADD COLUMN IF NOT EXISTS owner VARCHAR(150);
ALTER TABLE services ADD COLUMN IF NOT EXISTS repository VARCHAR(250);
ALTER TABLE services ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE services ADD COLUMN IF NOT EXISTS service_key VARCHAR(150);

-- Backfill service_key from the name for existing rows (the demo seed and the
-- collector catalog both key telemetry by the slug, i.e. the lowercased name).
UPDATE services SET service_key = lower(name) WHERE service_key IS NULL;
CREATE INDEX IF NOT EXISTS idx_services_service_key ON services(service_key);
