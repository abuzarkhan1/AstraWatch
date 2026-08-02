-- AstraWatch Schema V7 — Real invites, API keys, synthetic checks, sessions
-- Audit completion: acceptInvite threw UnsupportedOperationException, API-key
-- endpoints fabricated ak_ tokens, synthetic checks fabricated IDs, and sessions
-- fabricated rows. These tables make all four real.

-- ── Invitations ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    team_id UUID REFERENCES teams(id),
    role VARCHAR(50) NOT NULL DEFAULT 'VIEWER',
    token_hash VARCHAR(64) NOT NULL,          -- SHA-256 of the invite token
    invited_by UUID REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);
CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token_hash);

-- ── API Keys ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(64) NOT NULL,            -- SHA-256 of the plaintext key
    key_prefix VARCHAR(16) NOT NULL,          -- first 8 chars, for display only
    permissions JSONB NOT NULL DEFAULT '["read"]',
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    expires_at TIMESTAMPTZ,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- ── Synthetic Checks ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS synthetic_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(16) NOT NULL DEFAULT 'http', -- http | tcp | dns
    url TEXT NOT NULL,
    interval_seconds INTEGER NOT NULL DEFAULT 60,
    status VARCHAR(16) NOT NULL DEFAULT 'passing',
    response_time_ms INTEGER,
    uptime NUMERIC(6,2) NOT NULL DEFAULT 100.00,
    last_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_synthetic_checks_org ON synthetic_checks(org_id);

-- ── Sessions (real, persisted) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device VARCHAR(255),
    ip VARCHAR(64),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ── User token columns (email verification + password reset) ──────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;
