-- 000017_create_system_settings.up.sql
-- Create system_settings table for site-wide configuration (such as timezone)

CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Default site-wide timezone to America/Toronto (Eastern Time)
INSERT INTO system_settings (key, value)
VALUES ('timezone', 'America/Toronto')
ON CONFLICT (key) DO NOTHING;

-- Normalize existing midnight UTC FAT dates and target ship dates to noon UTC (12:00:00)
-- This eliminates date shifting backwards across western timezones (e.g. UTC-4 / UTC-5)
UPDATE machines 
SET fat_date = fat_date + INTERVAL '12 hours' 
WHERE fat_date IS NOT NULL AND (fat_date AT TIME ZONE 'UTC')::time = '00:00:00';

UPDATE sales_orders 
SET target_ship_date = target_ship_date + INTERVAL '12 hours' 
WHERE target_ship_date IS NOT NULL AND (target_ship_date AT TIME ZONE 'UTC')::time = '00:00:00';
