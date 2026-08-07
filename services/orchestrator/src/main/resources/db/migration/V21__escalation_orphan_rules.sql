-- V21: fresh-DB seeder crash fix. The V2 migration created escalation_policies
-- with an ORPHAN `rules JSONB NOT NULL` column — the JPA entity maps `steps`
-- (Hibernate ddl-auto adds it AFTER Flyway), so a new insert never populates
-- `rules`, and the NOT NULL constraint aborted the entire DemoDataSeeder on a
-- fresh database (all seeded pages ended up empty). The `rules` column is
-- unused dead schema; drop it.
--
-- Also defensively convert `steps` to TEXT when it already exists (old DBs
-- where Hibernate created it as jsonb before this migration) — same class of
-- fix as V18, needed here because `steps` is NOT created by any Flyway script
-- so V18's existence guard can never catch it on a fresh DB.
ALTER TABLE escalation_policies DROP COLUMN IF EXISTS rules;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'escalation_policies' AND column_name = 'steps') THEN
        ALTER TABLE escalation_policies
            ALTER COLUMN steps TYPE TEXT USING steps::text;
    END IF;
END $$;
