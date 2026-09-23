-- Migration 000020: Add Non-Conformance Report (NCR) support to defects table
ALTER TABLE defects ADD COLUMN IF NOT EXISTS is_ncr BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS ncr_number VARCHAR(50);
ALTER TABLE defects ADD COLUMN IF NOT EXISTS assembler VARCHAR(100);
ALTER TABLE defects ADD COLUMN IF NOT EXISTS location VARCHAR(255);
ALTER TABLE defects ADD COLUMN IF NOT EXISTS root_cause TEXT;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS corrective_action TEXT;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS closeout_date TIMESTAMPTZ;
ALTER TABLE defects ADD COLUMN IF NOT EXISTS team_lead_signature VARCHAR(100);

-- Case-insensitive unique index on non-empty ncr_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_defects_ncr_number ON defects (LOWER(ncr_number)) WHERE ncr_number IS NOT NULL AND ncr_number != '';
CREATE INDEX IF NOT EXISTS idx_defects_is_ncr ON defects (is_ncr);
