-- AstraWatch Schema V1
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    mfa_secret TEXT,
    mfa_enabled BOOLEAN DEFAULT false,
    email_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_team_roles (
    user_id UUID REFERENCES users(id),
    team_id UUID REFERENCES teams(id),
    role VARCHAR(50) NOT NULL,
    PRIMARY KEY (user_id, team_id)
);

CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    team_id UUID REFERENCES teams(id),
    cluster VARCHAR(100),
    namespace VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID REFERENCES services(id),
    anomaly_id UUID,
    severity VARCHAR(20) NOT NULL,
    state VARCHAR(30) NOT NULL DEFAULT 'DETECTED',
    assigned_to UUID REFERENCES users(id),
    root_cause JSONB,
    title VARCHAR(500),
    description TEXT,
    resolution_note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE TABLE incident_events (
    id BIGSERIAL PRIMARY KEY,
    incident_id UUID REFERENCES incidents(id),
    event_type VARCHAR(50) NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE healing_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES incidents(id),
    action_type VARCHAR(50) NOT NULL,
    parameters JSONB,
    risk_score SMALLINT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    approved_by UUID REFERENCES users(id),
    before_metrics JSONB,
    after_metrics JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_services_team ON services(team_id);
CREATE INDEX idx_incidents_service_state ON incidents(service_id, state);
CREATE INDEX idx_incidents_created ON incidents(created_at DESC);
CREATE INDEX idx_incident_events_incident ON incident_events(incident_id, created_at);
CREATE INDEX idx_healing_incident ON healing_actions(incident_id);
CREATE INDEX idx_audit_actor ON audit_log(actor_id, created_at DESC);

CREATE TABLE slo_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID REFERENCES services(id),
    name VARCHAR(200),
    metric VARCHAR(100),
    target_percentage NUMERIC(5,2),
    window_days SMALLINT DEFAULT 30,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
