-- V17: track when a notification rule last fired.
-- The alert rule evaluator persists the real trigger time here so the
-- Alerting Center's "last triggered" column reflects actual evaluation.
ALTER TABLE notification_rules ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ;
