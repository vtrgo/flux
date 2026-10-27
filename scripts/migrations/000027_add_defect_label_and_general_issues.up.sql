-- Migration 000027: Add label column to defects table for general issues and classification
ALTER TABLE defects ADD COLUMN IF NOT EXISTS label VARCHAR(50) NOT NULL DEFAULT 'Defect';
CREATE INDEX IF NOT EXISTS idx_defects_label ON defects (label);
