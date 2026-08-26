-- Add password_hash to users table
ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);

-- Add tracking columns to defects table
ALTER TABLE defects ADD COLUMN created_by_user_id UUID REFERENCES users(id);
ALTER TABLE defects ADD COLUMN fixed_by_user_id UUID REFERENCES users(id);
ALTER TABLE defects ADD COLUMN verified_by_user_id UUID REFERENCES users(id);
