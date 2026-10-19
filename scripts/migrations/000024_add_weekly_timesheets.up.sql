-- Migration 000024: Add Weekly Timesheets and link to Universal Time Entries

CREATE TABLE IF NOT EXISTS weekly_timesheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start_date DATE NOT NULL, -- Monday of work week (ISO)
    status VARCHAR(30) NOT NULL DEFAULT 'draft', -- 'draft', 'submitted', 'approved', 'rejected'
    total_hours NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    submitted_at TIMESTAMPTZ,
    submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_week UNIQUE(user_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_weekly_timesheets_user_week ON weekly_timesheets(user_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_weekly_timesheets_status ON weekly_timesheets(status);

-- Link time_entries to weekly_timesheets
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS weekly_timesheet_id UUID REFERENCES weekly_timesheets(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_time_entries_weekly_timesheet ON time_entries(weekly_timesheet_id);

-- Backfill existing time_entries into weekly_timesheets
INSERT INTO weekly_timesheets (user_id, week_start_date, status, total_hours, created_at, updated_at)
SELECT 
    user_id,
    date_trunc('week', work_date)::date as week_start_date,
    'draft' as status,
    COALESCE(SUM(hours_spent), 0.00) as total_hours,
    NOW(),
    NOW()
FROM time_entries
GROUP BY user_id, date_trunc('week', work_date)::date
ON CONFLICT (user_id, week_start_date) DO UPDATE
SET total_hours = EXCLUDED.total_hours;

UPDATE time_entries te
SET weekly_timesheet_id = wt.id
FROM weekly_timesheets wt
WHERE te.user_id = wt.user_id
  AND date_trunc('week', te.work_date)::date = wt.week_start_date;
