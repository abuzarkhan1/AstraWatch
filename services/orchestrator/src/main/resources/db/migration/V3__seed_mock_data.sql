-- AstraWatch Schema V3 — Mock Data Seed for End-to-End Testing

-- ── 1. Create Default Organization & Teams ────────────────────────────────
INSERT INTO organizations (id, name, slug, billing_plan, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'AstraWatch Cloud', 'astrawatch-cloud', 'enterprise', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO teams (id, org_id, name)
VALUES 
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'SRE Core Team'),
  ('11111111-1111-1111-1111-111111111112', '00000000-0000-0000-0000-000000000001', 'Backend Platform')
ON CONFLICT (id) DO NOTHING;

-- ── 2. Create Services ───────────────────────────────────────────────────
INSERT INTO services (id, name, team_id, cluster, namespace)
VALUES 
  ('a1b2c3d4-0001-4000-8000-000000000001', 'Payment API', '11111111-1111-1111-1111-111111111111', 'us-east-prod-01', 'payments'),
  ('a1b2c3d4-0002-4000-8000-000000000002', 'User Service', '11111111-1111-1111-1111-111111111112', 'us-east-prod-01', 'identity'),
  ('a1b2c3d4-0003-4000-8000-000000000003', 'Notification Service', '11111111-1111-1111-1111-111111111112', 'eu-west-prod-02', 'notifications'),
  ('a1b2c3d4-0004-4000-8000-000000000004', 'Auth Gateway', '11111111-1111-1111-1111-111111111111', 'us-east-prod-01', 'identity'),
  ('a1b2c3d4-0005-4000-8000-000000000005', 'Inventory Engine', '11111111-1111-1111-1111-111111111112', 'us-east-prod-01', 'logistics'),
  ('a1b2c3d4-0006-4000-8000-000000000006', 'Analytics Pipeline', '11111111-1111-1111-1111-111111111111', 'us-east-prod-01', 'data')
ON CONFLICT (id) DO NOTHING;

