-- Migration 000018: Add due_date to defects and enforce moderate length on description
ALTER TABLE defects ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;

-- Restrict description to moderate length (VARCHAR(255))
ALTER TABLE defects ALTER COLUMN description TYPE VARCHAR(255);
