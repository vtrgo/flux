-- Migration 000022: Add Foundational Timesheets, Project Tasks & Labor Allocation

-- 1. Project Tasks table for machine task division and quoting
CREATE TABLE IF NOT EXISTS project_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    task_code VARCHAR(50) NOT NULL,
    task_name VARCHAR(100) NOT NULL,
    department VARCHAR(50) NOT NULL,
    quoted_hours NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'open',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_machine_task UNIQUE(machine_id, task_code)
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_machine ON project_tasks(machine_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_department ON project_tasks(department);

-- 2. Universal Time Entries Ledger
CREATE TABLE IF NOT EXISTS time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
    entry_type VARCHAR(30) NOT NULL DEFAULT 'production', -- 'production', 'rework', 'issue_fix', 'indirect'
    project_task_id UUID REFERENCES project_tasks(id) ON DELETE SET NULL,
    rework_item_id UUID REFERENCES rework_items(id) ON DELETE SET NULL,
    defect_id UUID REFERENCES defects(id) ON DELETE SET NULL,
    work_date DATE NOT NULL DEFAULT CURRENT_DATE,
    hours_spent NUMERIC(5, 2) NOT NULL CHECK (hours_spent > 0 AND hours_spent <= 24),
    work_description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_user_date ON time_entries(user_id, work_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_machine ON time_entries(machine_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(project_task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_rework ON time_entries(rework_item_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_defect ON time_entries(defect_id);
