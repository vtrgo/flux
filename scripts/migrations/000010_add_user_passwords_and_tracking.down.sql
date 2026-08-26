-- Remove tracking columns from defects table
ALTER TABLE defects DROP COLUMN verified_by_user_id;
ALTER TABLE defects DROP COLUMN fixed_by_user_id;
ALTER TABLE defects DROP COLUMN created_by_user_id;

-- Remove password_hash from users table
ALTER TABLE users DROP COLUMN password_hash;
