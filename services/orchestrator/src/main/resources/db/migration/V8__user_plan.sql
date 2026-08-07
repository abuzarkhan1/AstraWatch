-- AstraWatch Schema V8 — User plan tier for entitlement enforcement.
-- Populated by the payment webhook path (payment-service -> orchestrator
-- internal /api/v1/internal/billing/plan-changed). Defaults to the free tier.
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(32) NOT NULL DEFAULT 'free';
