-- Migration 000021: Revert Rework Tracking with Project & Quality Containment (SOP 1-003)

ALTER TABLE attachments DROP COLUMN IF EXISTS rework_id;
DROP TABLE IF EXISTS controls_schematic_reworks;
DROP TABLE IF EXISTS rework_items;
