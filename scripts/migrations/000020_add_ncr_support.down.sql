-- Revert migration 000020
DROP INDEX IF EXISTS idx_defects_ncr_number;
DROP INDEX IF EXISTS idx_defects_is_ncr;
ALTER TABLE defects DROP COLUMN IF EXISTS team_lead_signature;
ALTER TABLE defects DROP COLUMN IF EXISTS closeout_date;
ALTER TABLE defects DROP COLUMN IF EXISTS corrective_action;
ALTER TABLE defects DROP COLUMN IF EXISTS root_cause;
ALTER TABLE defects DROP COLUMN IF EXISTS location;
ALTER TABLE defects DROP COLUMN IF EXISTS assembler;
ALTER TABLE defects DROP COLUMN IF EXISTS ncr_number;
ALTER TABLE defects DROP COLUMN IF EXISTS is_ncr;
