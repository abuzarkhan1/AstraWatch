-- AstraWatch Schema V13 — Synthetic check results.
-- The probe runner persists every execution here so GET /checks/{id}/results
-- returns real history and uptime is computed from real observations instead
-- of being fabricated or hardcoded to 100.
CREATE TABLE IF NOT EXISTS synthetic_check_results (
    id BIGSERIAL PRIMARY KEY,
    check_id UUID NOT NULL REFERENCES synthetic_checks(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL,           -- passing | failing
    response_time_ms INTEGER,
    error_message TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_synthetic_check_results_check
    ON synthetic_check_results(check_id, checked_at DESC);
