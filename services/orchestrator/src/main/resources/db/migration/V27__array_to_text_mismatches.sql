-- V27: MaintenanceWindow.service_ids and StatusPageMaintenance.component_ids
-- are UUID[] in the schema but the entities bind plain String (a JSON array of
-- UUIDs). Postgres rejects inserting varchar into a UUID[] column, so creating
-- a maintenance window or status-page maintenance fails with
-- 'column X is of type uuid[] but expression is of type character varying'.
-- No code reads these with array operators, so TEXT is correct.
ALTER TABLE maintenance_windows      ALTER COLUMN service_ids   TYPE TEXT USING service_ids::text;
ALTER TABLE status_page_maintenances ALTER COLUMN component_ids TYPE TEXT USING component_ids::text;
