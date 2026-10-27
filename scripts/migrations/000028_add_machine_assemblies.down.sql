-- Migration 000028 Down: Revert Machine Assemblies

ALTER TABLE rework_items DROP COLUMN IF EXISTS assembly_id;
ALTER TABLE kitting_parts DROP COLUMN IF EXISTS assembly_id;
ALTER TABLE time_entries DROP COLUMN IF EXISTS assembly_id;
DROP TABLE IF EXISTS machine_assemblies CASCADE;
