ALTER TABLE attachments ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_issue_id_fkey;
ALTER TABLE attachments ADD CONSTRAINT attachments_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES defects(id) ON DELETE CASCADE;
