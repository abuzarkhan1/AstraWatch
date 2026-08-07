-- V25: incidents.root_cause is jsonb (V2-era schema / Hibernate columnDefinition)
-- but the Incident entity binds a plain String. Postgres rejects inserting a
-- varchar into jsonb, so every incident creation fails (AlertRuleEvaluator and
-- the AnomalyEventConsumer both hit this) — which is why incidents/MTTR were
-- empty. The field is free-text ("Analysis pending — see incident for
-- details."), so TEXT is the correct type.
ALTER TABLE incidents ALTER COLUMN root_cause TYPE TEXT USING root_cause::text;
