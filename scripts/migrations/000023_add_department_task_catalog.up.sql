-- Migration 000023: Add Department Core Task Catalog

CREATE TABLE IF NOT EXISTS department_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department VARCHAR(50) NOT NULL,
    task_code VARCHAR(50) NOT NULL,
    task_name VARCHAR(100) NOT NULL,
    default_quoted_hours NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_dept_task UNIQUE(department, task_code)
);

CREATE INDEX IF NOT EXISTS idx_dept_tasks_dept ON department_tasks(department, is_active);

-- Seed initial core department tasks
INSERT INTO department_tasks (department, task_code, task_name, default_quoted_hours)
VALUES
    ('assembly', 'mech_assembly', 'Mechanical Assembly', 40.00),
    ('assembly', 'sub_assy', 'Sub-Assembly & Drive Alignment', 20.00),
    ('assembly', 'final_integration', 'Final Assembly & Tooling Mount', 25.00),
    ('controls', 'elec_wiring', 'Panel Build & Machine Wiring', 25.00),
    ('controls', 'controls_debug', 'PLC / HMI Programming & Commissioning', 15.00),
    ('controls', 'pneumatics', 'Pneumatics & Sensor Plumbing', 10.00),
    ('machine-shop', 'cnc_milling', 'CNC Milling / Machining', 25.00),
    ('machine-shop', 'manual_machining', 'Manual Lathe & Mill Work', 15.00),
    ('machine-shop', 'deburr_finish', 'Deburring & Finishing', 8.00),
    ('laser', 'laser_cutting', 'Laser Cutting & Nesting', 10.00),
    ('laser', 'sheet_metal_fab', 'Sheet Metal Forming & Bending', 12.00),
    ('design', 'mech_design', 'Mechanical CAD & Detailing', 20.00),
    ('design', 'controls_design', 'Electrical Schematics & BOM', 15.00),
    ('kitting', 'kitting_parts_pull', 'Parts Picking & Traveler Kitting', 8.00),
    ('kitting', 'outside_proc_prep', 'Outside Processing Staging', 4.00),
    ('enclosures', 'enclosure_fab', 'Enclosure Frame & Panel Fab', 12.00),
    ('quality', 'testing_fat', 'Quality Inspection & FAT Runoff', 8.00)
ON CONFLICT (department, task_code) DO NOTHING;
