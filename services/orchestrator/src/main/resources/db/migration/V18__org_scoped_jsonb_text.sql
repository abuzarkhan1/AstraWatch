-- V18: remaining jsonb columns that are bound as String by Hibernate.
-- Same class of fix as V10 (notification_rules) and V16 (runbooks): the JPA
-- entities map NotificationChannel.config, EscalationPolicy.steps and
-- OnCallRotation.member_ids as plain String fields, which Hibernate binds as
-- VARCHAR parameters — Postgres rejects that for native jsonb columns
-- ("column is of type jsonb but expression is of type character varying"),
-- 500'ing channel/rotation/policy creation. TEXT keeps the same JSON document
-- semantics and guarantees varchar binding works on real Postgres.
--
-- Escalation policies are guarded: the V2 migration created escalation_policies
-- with a `rules` column and V6's CREATE TABLE IF NOT EXISTS silently no-ops, so
-- `steps` may only exist after Hibernate's ddl-auto runs (which happens after
-- Flyway on a fresh DB). Alter only when the column is present.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'notification_channels' AND column_name = 'config') THEN
        ALTER TABLE notification_channels
            ALTER COLUMN config TYPE TEXT USING config::text;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'escalation_policies' AND column_name = 'steps') THEN
        ALTER TABLE escalation_policies
            ALTER COLUMN steps TYPE TEXT USING steps::text;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'on_call_rotations' AND column_name = 'member_ids') THEN
        ALTER TABLE on_call_rotations
            ALTER COLUMN member_ids TYPE TEXT USING member_ids::text;
    END IF;
END $$;
