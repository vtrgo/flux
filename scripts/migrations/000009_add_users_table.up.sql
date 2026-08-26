CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    department VARCHAR(50),
    role VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add the user assignment column to defects
ALTER TABLE defects ADD COLUMN assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
