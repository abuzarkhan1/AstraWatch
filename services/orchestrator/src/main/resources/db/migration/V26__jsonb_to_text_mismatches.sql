-- V26: The JPA entities below map plain String fields onto columns created as
-- jsonb (either by the V2-era docker init schema or by @Column(columnDefinition
-- = "jsonb") with ddl-auto=update). Postgres rejects inserting a varchar into a
-- jsonb column, so any write to these tables fails with
-- 'column X is of type jsonb but expression is of type character varying'.
-- No native query in the codebase uses jsonb operators on these columns, so
-- TEXT is the correct type everywhere.
ALTER TABLE incident_events    ALTER COLUMN payload          TYPE TEXT USING payload::text;
ALTER TABLE healing_actions    ALTER COLUMN parameters       TYPE TEXT USING parameters::text;
ALTER TABLE healing_actions    ALTER COLUMN before_metrics   TYPE TEXT USING before_metrics::text;
ALTER TABLE healing_actions    ALTER COLUMN after_metrics    TYPE TEXT USING after_metrics::text;
ALTER TABLE postmortems        ALTER COLUMN timeline_edits      TYPE TEXT USING timeline_edits::text;
ALTER TABLE postmortems        ALTER COLUMN contributing_factors TYPE TEXT USING contributing_factors::text;
ALTER TABLE api_keys           ALTER COLUMN permissions      TYPE TEXT USING permissions::text;
ALTER TABLE audit_log          ALTER COLUMN metadata         TYPE TEXT USING metadata::text;
