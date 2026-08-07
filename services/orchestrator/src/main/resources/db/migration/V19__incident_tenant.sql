-- V19: incidents carry the tenant id they were created under.
-- The incident-created Kafka event hardcoded tenantId "default", so the
-- realtime gateway pushed to tenant:default:* rooms while the demo admin sits
-- in tenant:<team-uuid>:* rooms — incident toasts/updates never reached the
-- dashboard (tenant mismatch, same class as the telemetry tenant bug). The
-- incident now records its tenant and the Kafka event carries it.
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_created ON incidents(tenant_id, created_at DESC);
