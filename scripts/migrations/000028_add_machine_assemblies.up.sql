-- Migration 000028: Add Machine Assemblies, Hierarchies, and Linkages

-- 1. Create recursive assemblies table with self-referencing parent
CREATE TABLE IF NOT EXISTS machine_assemblies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    parent_assembly_id UUID REFERENCES machine_assemblies(id) ON DELETE CASCADE, -- NULL for Root Node
    assembly_code VARCHAR(50) NOT NULL,        -- e.g. "ASM-01", "SUB-01A"
    name VARCHAR(255) NOT NULL,                -- e.g. "Centrifugal Bowl Drive", "Singulator Mechanism"
    description TEXT,
    drawing_number VARCHAR(100),               -- SolidWorks PDM Drawing Reference
    revision VARCHAR(20) DEFAULT 'A',
    department VARCHAR(50) NOT NULL DEFAULT 'assembly',
    quoted_hours NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) NOT NULL DEFAULT 'design_draft',
    -- Status lifecycle: 'design_draft' -> 'ready_for_kitting' -> 'kitting_in_progress' -> 'kitted' -> 'in_assembly' -> 'assembled' -> 'qc_verified'
    sequence_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_machine_assembly_code UNIQUE (machine_id, assembly_code)
);

-- 2. Link Timesheets, Kitting Parts, and Rework directly to Assembly Nodes
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS assembly_id UUID REFERENCES machine_assemblies(id) ON DELETE SET NULL;
ALTER TABLE kitting_parts ADD COLUMN IF NOT EXISTS assembly_id UUID REFERENCES machine_assemblies(id) ON DELETE CASCADE;
ALTER TABLE rework_items ADD COLUMN IF NOT EXISTS assembly_id UUID REFERENCES machine_assemblies(id) ON DELETE SET NULL;

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_assemblies_machine ON machine_assemblies(machine_id);
CREATE INDEX IF NOT EXISTS idx_assemblies_parent ON machine_assemblies(parent_assembly_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_assembly ON time_entries(assembly_id);
CREATE INDEX IF NOT EXISTS idx_kitting_parts_assembly ON kitting_parts(assembly_id);
CREATE INDEX IF NOT EXISTS idx_rework_items_assembly ON rework_items(assembly_id);
