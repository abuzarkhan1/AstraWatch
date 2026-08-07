-- V10: notification_rules column types
--
-- The entity maps `conditions` and `channelIds` as plain String fields. The
-- V2 schema declared them as jsonb / UUID[], which Hibernate binds as VARCHAR
-- parameters — Postgres rejects that with "column is of type jsonb but
-- expression is of type character varying" (500 on POST /api/v1/notifications/rules).
-- Storing the payload as TEXT keeps the exact same JSON document semantics and
-- guarantees varchar binding works on real Postgres.

ALTER TABLE notification_rules
    ALTER COLUMN conditions TYPE TEXT USING conditions::text,
    ALTER COLUMN channel_ids TYPE TEXT USING channel_ids::text;
