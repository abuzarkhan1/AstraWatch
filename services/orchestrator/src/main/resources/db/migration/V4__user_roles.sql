-- AstraWatch Schema V4 — User Roles & Status (RBAC)

ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'VIEWER';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

-- Seed default Admin user
-- Bootstrap credentials: admin@astrawatch.io / Admin@12345  (change after first login)
INSERT INTO users (id, email, password_hash, role, is_active, team_id, email_verified, created_at)
VALUES (
    '00000000-0000-0000-0000-000000000099',
    'admin@astrawatch.io',
    '$2a$10$kKf7AGIhojvv2OBoXnadg.IXQnMeWFspmDkggXROIeodm7pa/84uy',
    'ADMIN',
    true,
    '11111111-1111-1111-1111-111111111111',
    true,
    NOW()
)
ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', is_active = true;
