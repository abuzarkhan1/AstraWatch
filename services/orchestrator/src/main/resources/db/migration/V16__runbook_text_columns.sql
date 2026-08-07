-- V16: runbook column types
--
-- The Runbook entity maps `steps` and `tags` as plain String fields but the
-- V2 schema declared them as jsonb / TEXT[], and runbook_versions.steps as
-- jsonb. Hibernate binds String fields as VARCHAR parameters — Postgres
-- rejects that for jsonb/text[] columns ("column is of type jsonb but
-- expression is of type character varying"), so creating a runbook always
-- 500'd. Same class of bug V10 fixed for notification_rules: store the same
-- JSON document as TEXT so varchar binding works on real Postgres.
ALTER TABLE runbooks
    ALTER COLUMN steps TYPE TEXT USING steps::text,
    ALTER COLUMN tags TYPE TEXT USING tags::text;

ALTER TABLE runbook_versions
    ALTER COLUMN steps TYPE TEXT USING steps::text;

-- runbook_executions.step_results is JSONB (V15). The JPA entity persists it
-- as a String; migrate to TEXT for the same varchar-binding reason.
ALTER TABLE runbook_executions
    ALTER COLUMN step_results TYPE TEXT USING step_results::text;
