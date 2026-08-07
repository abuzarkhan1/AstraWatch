-- V24: synthetic_check_results.passed is a V2-era orphan column.
-- The SyntheticCheckResult entity maps `status` (varchar) and never sets
-- `passed`; because the column is NOT NULL with no default, every probe
-- insert fails with a constraint violation. Nothing reads `passed`.
ALTER TABLE synthetic_check_results DROP COLUMN IF EXISTS passed;
