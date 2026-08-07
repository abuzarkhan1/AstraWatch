-- V12: make synthetic_checks.uptime nullable.
-- V7 declared it NOT NULL DEFAULT 100.00, which forced every unmonitored check
-- to present a fabricated 100% uptime. Null now means "no probe data yet" — the
-- API layer reports it honestly and the UI renders '—'.
--
-- Guarded: on some schemas the V2-era synthetic_checks table (created without an
-- uptime column) survives, so the column may not exist at all — skip gracefully.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'synthetic_checks' AND column_name = 'uptime'
    ) THEN
        ALTER TABLE synthetic_checks ALTER COLUMN uptime DROP NOT NULL;
    END IF;
END $$;
