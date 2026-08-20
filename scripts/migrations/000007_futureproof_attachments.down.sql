ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_issue_id_fkey;
ALTER TABLE attachments DROP COLUMN IF EXISTS metadata;
