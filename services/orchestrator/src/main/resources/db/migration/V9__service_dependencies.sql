-- V9: service dependencies for the catalog's /services/{id}/dependencies endpoint.
-- Audit fix: the endpoint previously returned a hardcoded empty list. This table
-- gives it real data derived from the seeded services in V3.
CREATE TABLE IF NOT EXISTS service_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    depends_on UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    kind VARCHAR(40) DEFAULT 'RPC',
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_service_dep UNIQUE (service_id, depends_on)
);

INSERT INTO service_dependencies (service_id, depends_on, kind)
SELECT s1.id, s2.id, d.kind
FROM (VALUES
    ('a1b2c3d4-0001-4000-8000-000000000001', 'a1b2c3d4-0004-4000-8000-000000000004', 'RPC'),  -- Payment API -> Auth Gateway
    ('a1b2c3d4-0001-4000-8000-000000000001', 'a1b2c3d4-0002-4000-8000-000000000002', 'DB'),    -- Payment API -> User Service
    ('a1b2c3d4-0002-4000-8000-000000000002', 'a1b2c3d4-0004-4000-8000-000000000004', 'RPC'),  -- User Service -> Auth Gateway
    ('a1b2c3d4-0003-4000-8000-000000000003', 'a1b2c3d4-0001-4000-8000-000000000001', 'RPC'),  -- Notification Service -> Payment API
    ('a1b2c3d4-0003-4000-8000-000000000003', 'a1b2c3d4-0002-4000-8000-000000000002', 'RPC'),  -- Notification Service -> User Service
    ('a1b2c3d4-0005-4000-8000-000000000005', 'a1b2c3d4-0002-4000-8000-000000000002', 'RPC'),  -- Inventory Engine -> User Service
    ('a1b2c3d4-0006-4000-8000-000000000006', 'a1b2c3d4-0005-4000-8000-000000000005', 'MQ'),   -- Analytics Pipeline -> Inventory Engine
    ('a1b2c3d4-0006-4000-8000-000000000006', 'a1b2c3d4-0003-4000-8000-000000000003', 'MQ')    -- Analytics Pipeline -> Notification Service
) AS d(service_id, depends_on, kind)
JOIN services s1 ON s1.id::text = d.service_id
JOIN services s2 ON s2.id::text = d.depends_on
ON CONFLICT (service_id, depends_on) DO NOTHING;
