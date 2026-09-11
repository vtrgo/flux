-- Migration 000011: Future-proof users table for corporate AD / LDAP integration
ALTER TABLE users ADD COLUMN auth_provider VARCHAR(50) NOT NULL DEFAULT 'local';
ALTER TABLE users ADD COLUMN external_id VARCHAR(255);

-- Index for rapid lookups when resolving external Active Directory identities (e.g. sAMAccountName, objectGUID, or UPN)
CREATE INDEX idx_users_external_id ON users(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_users_auth_provider ON users(auth_provider);
