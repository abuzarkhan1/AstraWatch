-- AstraWatch Schema V6 — On-Call Rotations & Escalation Policies
-- Strategy gap 4: on-call scheduling was a fabricated stub (OnCallController
-- returned empty lists and invented IDs). These tables make rotations real:
-- a rotation has members ordered by shift sequence; the escalation policy
-- defines who gets paged and in what order when an incident is not acked.

CREATE TABLE IF NOT EXISTS on_call_rotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    member_ids JSONB NOT NULL DEFAULT '[]',       -- ordered UUID[] of user ids
    shift_length_hours INTEGER NOT NULL DEFAULT 168, -- 7-day default shift
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS on_call_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rotation_id UUID NOT NULL REFERENCES on_call_rotations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_on_call_shifts_rotation_time
    ON on_call_shifts (rotation_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS escalation_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    rotation_id UUID REFERENCES on_call_rotations(id) ON DELETE SET NULL,
    steps JSONB NOT NULL DEFAULT '[]',  -- [{"level":1,"afterMinutes":5,"targets":["rotation"]}]
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
