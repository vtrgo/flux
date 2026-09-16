-- Revert migration 000018
ALTER TABLE defects DROP COLUMN IF EXISTS due_date;
ALTER TABLE defects ALTER COLUMN description TYPE TEXT;
