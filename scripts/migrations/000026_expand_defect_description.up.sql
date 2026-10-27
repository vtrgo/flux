-- Migration 000026: Expand defect description from VARCHAR(255) to TEXT to support detailed shop floor notes
ALTER TABLE defects ALTER COLUMN description TYPE TEXT;
