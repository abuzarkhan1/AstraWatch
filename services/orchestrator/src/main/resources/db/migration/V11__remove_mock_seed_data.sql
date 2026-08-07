-- V11: Remove the V3 mock-data seed and V9 fake dependency edges.
-- V3 inserted a fake organization, two fake teams and six fake services with
-- hardcoded UUIDs (Payment API, User Service, ...). The service catalog now has a
-- real ingestion path — the collector derives services from actual telemetry — so
-- these seeded rows are pure dummy data that made the Catalog/Topology/Dashboard
-- pages show invented services. The bootstrap admin user (V4) is kept but
-- detached from the deleted mock team.

-- 1. Detach the bootstrap admin from the mock team before the team is deleted.
UPDATE users
SET team_id = NULL
WHERE team_id IN (
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111112'
);

-- 2. Remove the fake dependency edges (V9) between the mock services.
DELETE FROM service_dependencies
WHERE service_id IN (
    'a1b2c3d4-0001-4000-8000-000000000001',
    'a1b2c3d4-0002-4000-8000-000000000002',
    'a1b2c3d4-0003-4000-8000-000000000003',
    'a1b2c3d4-0004-4000-8000-000000000004',
    'a1b2c3d4-0005-4000-8000-000000000005',
    'a1b2c3d4-0006-4000-8000-000000000006'
)
   OR depends_on IN (
    'a1b2c3d4-0001-4000-8000-000000000001',
    'a1b2c3d4-0002-4000-8000-000000000002',
    'a1b2c3d4-0003-4000-8000-000000000003',
    'a1b2c3d4-0004-4000-8000-000000000004',
    'a1b2c3d4-0005-4000-8000-000000000005',
    'a1b2c3d4-0006-4000-8000-000000000006'
);

-- 3. Delete the mock services (V3).
DELETE FROM services
WHERE id IN (
    'a1b2c3d4-0001-4000-8000-000000000001',
    'a1b2c3d4-0002-4000-8000-000000000002',
    'a1b2c3d4-0003-4000-8000-000000000003',
    'a1b2c3d4-0004-4000-8000-000000000004',
    'a1b2c3d4-0005-4000-8000-000000000005',
    'a1b2c3d4-0006-4000-8000-000000000006'
);

-- 4. Delete the mock teams (V3).
DELETE FROM teams
WHERE id IN (
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111112'
);

-- 5. Delete the mock organization (V3).
DELETE FROM organizations
WHERE id = '00000000-0000-0000-0000-000000000001';
