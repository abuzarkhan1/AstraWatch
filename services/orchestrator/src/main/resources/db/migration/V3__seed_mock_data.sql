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

-- ── 3. Create Sample Incidents ───────────────────────────────────────────
INSERT INTO incidents (id, service_id, severity, state, title, description, created_at, updated_at)
VALUES 
  (
    '22222222-2222-2222-2222-222222222201',
    'a1b2c3d4-0001-4000-8000-000000000001',
    'CRITICAL',
    'HEALING',
    'High Latency & eBPF Socket Buffer Overflow in Payment API',
    'eBPF probe detected 99th percentile response time spiked to 3,450ms. TCP retransmissions increased by 420%.',
    NOW() - INTERVAL '15 minutes',
    NOW() - INTERVAL '2 minutes'
  ),
  (
    '22222222-2222-2222-2222-222222222202',
    'a1b2c3d4-0002-4000-8000-000000000002',
    'HIGH',
    'INVESTIGATING',
    'DB Connection Pool Exhaustion in User Service',
    'Active connections saturated PostgreSQL pool (100/100). HTTP 500 error rate exceeded 4.2%.',
    NOW() - INTERVAL '45 minutes',
    NOW() - INTERVAL '10 minutes'
  ),
  (
    '22222222-2222-2222-2222-222222222203',
    'a1b2c3d4-0003-4000-8000-000000000003',
    'MEDIUM',
    'RESOLVED',
    'RabbitMQ Queue Backlog in Notification Worker',
    'Queue depth reached 45,000 items. Automated scale-out CRD restored latency to 12ms.',
    NOW() - INTERVAL '3 hours',
    NOW() - INTERVAL '1 hour'
  ),
  (
    '22222222-2222-2222-2222-222222222204',
    'a1b2c3d4-0004-4000-8000-000000000004',
    'LOW',
    'DETECTED',
    'Minor Memory Leak in Auth Gateway Pods',
    'Isolation Forest model detected 1.2% memory drift per hour across 4 replicas.',
    NOW() - INTERVAL '5 hours',
    NOW() - INTERVAL '4 hours'
  )
ON CONFLICT (id) DO NOTHING;

-- ── 4. Create Healing Actions ─────────────────────────────────────────────
INSERT INTO healing_actions (id, incident_id, action_type, parameters, risk_score, status, created_at, completed_at)
VALUES 
  (
    '33333333-3333-3333-3333-333333333301',
    '22222222-2222-2222-2222-222222222201',
    'POD_RESTART',
    '{"namespace": "payments", "deployment": "payment-api", "targetReplicas": 6}',
    25,
    'COMPLETED',
    NOW() - INTERVAL '10 minutes',
    NOW() - INTERVAL '8 minutes'
  ),
  (
    '33333333-3333-3333-3333-333333333302',
    '22222222-2222-2222-2222-222222222202',
    'SCALE_DEPLOYMENT',
    '{"namespace": "identity", "deployment": "user-service", "currentReplicas": 3, "targetReplicas": 8}',
    35,
    'PENDING',
    NOW() - INTERVAL '5 minutes',
    NULL
  ),
  (
    '33333333-3333-3333-3333-333333333303',
    '22222222-2222-2222-2222-222222222203',
    'FLUSH_MEMCACHED',
    '{"cluster": "notifications-cache"}',
    10,
    'COMPLETED',
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '1 hour 55 minutes'
  )
ON CONFLICT (id) DO NOTHING;

-- ── 5. Create SLO Definitions ─────────────────────────────────────────────
INSERT INTO slo_definitions (id, service_id, name, metric, target_percentage, window_days)
VALUES 
  ('44444444-4444-4444-4444-444444444401', 'a1b2c3d4-0001-4000-8000-000000000001', 'Payment API Latency', 'latency_p99', 99.95, 30),
  ('44444444-4444-4444-4444-444444444402', 'a1b2c3d4-0002-4000-8000-000000000002', 'User Service HTTP Success', 'http_success_rate', 99.90, 30),
  ('44444444-4444-4444-4444-444444444403', 'a1b2c3d4-0003-4000-8000-000000000003', 'Notification Queue Latency', 'queue_latency', 99.50, 30)
ON CONFLICT (id) DO NOTHING;

-- ── 6. Create Synthetic Checks ────────────────────────────────────────────
INSERT INTO synthetic_checks (id, org_id, name, type, target, interval_seconds, is_enabled)
VALUES 
  ('55555555-5555-5555-5555-555555555501', '00000000-0000-0000-0000-000000000001', 'Payment API Health Probe', 'HTTP', 'http://localhost:8085/healthz', 60, true),
  ('55555555-5555-5555-5555-555555555502', '00000000-0000-0000-0000-000000000001', 'Collector Telemetry Probe', 'HTTP', 'http://localhost:8080/health', 60, true),
  ('55555555-5555-5555-5555-555555555503', '00000000-0000-0000-0000-000000000001', 'Analyzer ML Health Probe', 'HTTP', 'http://localhost:8086/v1/health', 60, true)
ON CONFLICT (id) DO NOTHING;
