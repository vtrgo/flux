-- Migration 000025 Down: Revert Authoritative Tasks and Labor Correlation

DROP INDEX IF EXISTS idx_time_entries_task_id;
DROP INDEX IF EXISTS idx_time_entries_machine_task;
DROP INDEX IF EXISTS idx_project_tasks_machine_task;

ALTER TABLE time_entries DROP COLUMN IF EXISTS task_id;
ALTER TABLE project_tasks DROP COLUMN IF EXISTS task_id;
ALTER TABLE department_tasks DROP COLUMN IF EXISTS description;
