-- V22: repair the slo_definitions schema when the docker init-postgres.sql
-- (which runs before Flyway and makes V1 a no-op via baseline-on-migrate)
-- created the table with the OLD divergent shape: name NOT NULL and
-- metric_name instead of metric. That stale shape crashed the DemoDataSeeder
-- on fresh boots (null name → NOT NULL violation → all seeded pages empty).
-- This makes any such DB match the JPA entity (V1 + V14) without a reset.
ALTER TABLE slo_definitions ALTER COLUMN name DROP NOT NULL;

DO $$
BEGIN
    -- Drop the old metric_name column if present (entity maps `metric`).
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'slo_definitions' AND column_name = 'metric_name') THEN
        ALTER TABLE slo_definitions DROP COLUMN metric_name;
    END IF;

    -- Ensure `metric` exists (the entity maps it; V1 defined it but the stale
    -- init script never did).
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'slo_definitions' AND column_name = 'metric') THEN
        ALTER TABLE slo_definitions ADD COLUMN metric VARCHAR(100);
    END IF;

    -- Ensure service_key exists (V14 added it for catalog-key SLOs).
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'slo_definitions' AND column_name = 'service_key') THEN
        ALTER TABLE slo_definitions ADD COLUMN service_key VARCHAR(150);
    END IF;
END $$;
