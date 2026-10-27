-- Revert defect description from TEXT back to VARCHAR(255)
ALTER TABLE defects ALTER COLUMN description TYPE VARCHAR(255);
