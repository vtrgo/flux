-- Migration 000022 Down: Revert Foundational Timesheets, Project Tasks & Labor Allocation

DROP TABLE IF EXISTS time_entries;
DROP TABLE IF EXISTS project_tasks;
