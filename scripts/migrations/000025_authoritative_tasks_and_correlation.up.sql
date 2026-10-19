-- Migration 000025: Authoritative Tasks and Labor Correlation

-- 1. Enhance department_tasks (Authoritative Tasks) with description
ALTER TABLE department_tasks ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Link project_tasks (Assigned / Quoted Hours) to Authoritative Tasks
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES department_tasks(id) ON DELETE SET NULL;

-- 3. Link time_entries (Consumed / Actual Hours) to Authoritative Tasks
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES department_tasks(id) ON DELETE SET NULL;

-- 4. Backfill task_id in project_tasks
UPDATE project_tasks pt
SET task_id = dt.id
FROM department_tasks dt
WHERE pt.task_id IS NULL 
  AND (
      (LOWER(REPLACE(REPLACE(pt.department, '-', ''), '_', '')) = LOWER(REPLACE(REPLACE(dt.department, '-', ''), '_', ''))
       OR (LOWER(pt.department) IN ('controls', 'electrical-controls', 'electrical_controls') AND LOWER(dt.department) IN ('controls', 'electrical-controls', 'electrical_controls')))
      AND (pt.task_code = dt.task_code OR LOWER(pt.task_name) = LOWER(dt.task_name))
  );

-- 5. Backfill task_id in time_entries from project_tasks where available
UPDATE time_entries te
SET task_id = pt.task_id
FROM project_tasks pt
WHERE te.task_id IS NULL AND te.project_task_id = pt.id AND pt.task_id IS NOT NULL;

-- 6. Backfill remaining time_entries by matching description to task_name or task_code
UPDATE time_entries te
SET task_id = dt.id
FROM department_tasks dt
WHERE te.task_id IS NULL 
  AND (te.work_description = dt.task_name OR te.work_description = dt.task_code);

-- 7. Add correlation indexes
CREATE INDEX IF NOT EXISTS idx_project_tasks_machine_task ON project_tasks(machine_id, task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_machine_task ON time_entries(machine_id, task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_task_id ON time_entries(task_id);
