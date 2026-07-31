-- AstraWatch Schema V2 — Extended Tables (Auth, Notifications, Status Page, etc.)
-- Corresponds to doc sections 5.4, 7, 4.10, 4.11, 4.13, 4.14, 4.15

-- ── Password Management ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token_hash);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_history_user ON password_history(user_id, created_at DESC);

-- ── Session Management ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    refresh_token_hash TEXT NOT NULL,
    device_info JSONB,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_active_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS login_attempts (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    ip VARCHAR(45),
    success BOOLEAN,
    failure_reason VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_user ON login_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip, created_at DESC);

-- ── MFA ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mfa_backup_codes (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    code_hash TEXT NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── API Keys / Service Accounts ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    key_prefix VARCHAR(8) NOT NULL,
    key_hash TEXT NOT NULL,
    scopes TEXT[] NOT NULL,
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    is_revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

-- ── Organizations / Workspaces ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}',
    billing_plan VARCHAR(50) DEFAULT 'free',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE teams ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

CREATE TABLE IF NOT EXISTS organization_members (
    org_id UUID REFERENCES organizations(id),
    user_id UUID REFERENCES users(id),
    role VARCHAR(50) NOT NULL,
    joined_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (org_id, user_id)
);

-- ── Invitations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    team_id UUID REFERENCES teams(id),
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Notification Channels ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    config JSONB NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id UUID REFERENCES users(id),
    channel_type VARCHAR(50) NOT NULL,
    severity_min VARCHAR(20) DEFAULT 'LOW',
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    is_enabled BOOLEAN DEFAULT true,
    PRIMARY KEY (user_id, channel_type)
);

CREATE TABLE IF NOT EXISTS notification_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    conditions JSONB NOT NULL,
    channel_ids UUID[] NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Maintenance Windows ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    service_ids UUID[] NOT NULL,
    reason TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── On-Call Schedules ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS on_call_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    rotation_type VARCHAR(50) NOT NULL,
    timezone VARCHAR(100) DEFAULT 'UTC',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS on_call_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID REFERENCES on_call_schedules(id),
    user_id UUID REFERENCES users(id),
    role VARCHAR(50) NOT NULL DEFAULT 'PRIMARY',
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_on_call_active ON on_call_entries(starts_at, ends_at);

CREATE TABLE IF NOT EXISTS escalation_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    rules JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Postmortems ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS postmortems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES incidents(id) UNIQUE,
    summary TEXT,
    timeline_edits JSONB,
    contributing_factors TEXT[],
    severity_was_accurate BOOLEAN,
    lessons_learned TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS action_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    postmortem_id UUID REFERENCES postmortems(id),
    description TEXT NOT NULL,
    owner_id UUID REFERENCES users(id),
    status VARCHAR(30) DEFAULT 'OPEN',
    due_date DATE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Runbooks ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID REFERENCES services(id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    steps JSONB NOT NULL,
    tags TEXT[],
    action_type VARCHAR(50),
    current_revision INT DEFAULT 1,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runbook_versions (
    id BIGSERIAL PRIMARY KEY,
    runbook_id UUID REFERENCES runbooks(id),
    revision INT NOT NULL,
    steps JSONB NOT NULL,
    changelog TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Synthetic Checks ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS synthetic_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL,
    target VARCHAR(500) NOT NULL,
    config JSONB,
    interval_seconds INT DEFAULT 300,
    regions TEXT[] DEFAULT '{"us-east-1"}',
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS synthetic_check_results (
    id BIGSERIAL PRIMARY KEY,
    check_id UUID REFERENCES synthetic_checks(id),
    region VARCHAR(50),
    response_time_ms INT,
    status_code INT,
    passed BOOLEAN NOT NULL,
    error_message TEXT,
    checked_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_synthetic_results_check ON synthetic_check_results(check_id, checked_at DESC);

-- ── Dead Letter Queue ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dead_letter_queue (
    id BIGSERIAL PRIMARY KEY,
    topic VARCHAR(100) NOT NULL,
    partition INT,
    "offset" BIGINT,
    key VARCHAR(500),
    value TEXT,
    error_message TEXT,
    error_count INT DEFAULT 1,
    last_error_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Feature Flags ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    is_enabled BOOLEAN DEFAULT false,
    targeting_rules JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Status Page ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS status_page_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    group_name VARCHAR(100),
    status VARCHAR(50) DEFAULT 'OPERATIONAL',
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS status_page_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    email VARCHAR(255),
    phone VARCHAR(50),
    webhook_url VARCHAR(500),
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS status_page_maintenances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    component_ids UUID[],
    title VARCHAR(200) NOT NULL,
    description TEXT,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) DEFAULT 'SCHEDULED',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Service Scorecards ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_scorecards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID REFERENCES services(id),
    reliability_score NUMERIC(3,2),
    latency_score NUMERIC(3,2),
    error_rate_score NUMERIC(3,2),
    slo_attainment NUMERIC(5,2),
    calculated_at TIMESTAMPTZ DEFAULT now()
);

-- ── System Configuration ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(200) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Webhook Outbound ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    url VARCHAR(500) NOT NULL,
    events TEXT[] NOT NULL,
    secret TEXT,
    is_enabled BOOLEAN DEFAULT true,
    retry_count INT DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Billing / Usage ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_records (
    id BIGSERIAL PRIMARY KEY,
    org_id UUID REFERENCES organizations(id),
    metric_type VARCHAR(50) NOT NULL,
    value BIGINT NOT NULL,
    recorded_at DATE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_org_date ON usage_records(org_id, recorded_at);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) UNIQUE,
    plan VARCHAR(50) NOT NULL DEFAULT 'free',
    status VARCHAR(50) DEFAULT 'active',
    current_period_start DATE,
    current_period_end DATE,
    stripe_customer_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Idempotency Keys ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key VARCHAR(200) PRIMARY KEY,
    endpoint VARCHAR(200) NOT NULL,
    response_snapshot JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Audit Log Enhancements ───────────────────────────────────────────────
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log(org_id, created_at DESC);

-- ── Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_incident_events_incident_ts ON incident_events(incident_id, created_at);
CREATE INDEX IF NOT EXISTS idx_healing_actions_status ON healing_actions(status);
