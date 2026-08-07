-- AstraWatch Schema V15 — runbook executions.
-- Runbook execution previously fired an HTTP request into the void and
-- returned an execution id that was never tracked. This table records real
-- executions with per-step results so the Runbooks page shows actual history.
CREATE TABLE IF NOT EXISTS runbook_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    runbook_id UUID REFERENCES runbooks(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'RUNNING', -- RUNNING | COMPLETED | FAILED
    step_results JSONB,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    triggered_by UUID REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_runbook_executions_runbook
    ON runbook_executions(runbook_id, started_at DESC);
