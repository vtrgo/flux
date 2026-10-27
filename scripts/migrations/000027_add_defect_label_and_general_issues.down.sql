-- Migration 000027: Revert label column from defects table
DROP INDEX IF EXISTS idx_defects_label;
ALTER TABLE defects DROP COLUMN IF EXISTS label;
