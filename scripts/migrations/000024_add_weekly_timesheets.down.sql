-- Migration 000024 Down: Drop weekly timesheets

ALTER TABLE time_entries DROP COLUMN IF EXISTS weekly_timesheet_id;
DROP TABLE IF EXISTS weekly_timesheets;
