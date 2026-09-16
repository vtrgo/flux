-- Revert migration 000019
DROP INDEX IF EXISTS idx_users_email_lower;
ALTER TABLE users DROP COLUMN IF EXISTS email;
