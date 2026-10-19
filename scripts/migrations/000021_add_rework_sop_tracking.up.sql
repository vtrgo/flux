-- Migration 000021: Add Rework Tracking with Project & Quality Containment (SOP 1-003)

CREATE TABLE IF NOT EXISTS rework_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Project & Machine Containment
    sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
    defect_id UUID REFERENCES defects(id) ON DELETE SET NULL,

    -- Design Department Fields (SOP Step 1)
    project_number VARCHAR(50) NOT NULL,
    sub_assembly VARCHAR(100),
    part_number VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    revision VARCHAR(20) NOT NULL,
    material VARCHAR(100) NOT NULL,
    qty INT NOT NULL DEFAULT 1,
    part_type VARCHAR(20) NOT NULL DEFAULT 'NEW', -- 'NEW' or 'MOD'
    mech_designer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    date_released_from_mech_design TIMESTAMPTZ,
    pm_released_to_id UUID REFERENCES users(id) ON DELETE SET NULL,
    pdm_vault_released BOOLEAN NOT NULL DEFAULT FALSE,

    -- Project Management Fields (SOP Step 3)
    reason_for_rework TEXT NOT NULL,
    date_released_to_mfg TIMESTAMPTZ,
    requested_completion_date DATE,
    pm_delivered_to VARCHAR(100),
    pm_date_delivered TIMESTAMPTZ,

    -- Manufacturing Fields (SOP Step 4)
    expected_completion_date DATE,
    material_ordered_date DATE,
    assigned_machinist_id UUID REFERENCES users(id) ON DELETE SET NULL,
    date_mfg_completed TIMESTAMPTZ,
    part_given_to_or_left_at VARCHAR(150),
    is_after_hours_drop BOOLEAN NOT NULL DEFAULT FALSE,
    estimated_hours NUMERIC(6, 2) DEFAULT 0.00,
    actual_hours NUMERIC(6, 2) DEFAULT 0.00,

    -- Kitting / Outside Processing Fields (SOP Step 5)
    requires_outside_processing BOOLEAN NOT NULL DEFAULT FALSE,
    outside_vendor VARCHAR(150),
    date_sent_for_processing DATE,
    date_expected_from_processing DATE,
    date_received_from_processing DATE,
    kitting_delivered_to VARCHAR(100),
    kitting_date_delivered TIMESTAMPTZ,

    -- Assembly & Closure (SOP Step 2 & 3)
    status VARCHAR(50) NOT NULL DEFAULT 'design_draft',
    assembler_id UUID REFERENCES users(id) ON DELETE SET NULL,
    parts_collected_by_pm BOOLEAN NOT NULL DEFAULT FALSE,
    is_assembler_self_modified BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    completed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Controls Master Schematic Redline Checklists (SOP Step 6)
CREATE TABLE IF NOT EXISTS controls_schematic_reworks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
    schematic_number VARCHAR(100) NOT NULL,
    master_copy_redlined BOOLEAN NOT NULL DEFAULT FALSE,
    redlined_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    redlines_description TEXT,
    schematics_digitally_updated BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ,
    checklist_signed_off BOOLEAN NOT NULL DEFAULT FALSE,
    signed_off_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    signed_off_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Extend Attachments to Support Rework Drawings/Photos without violating defect constraints
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS rework_id UUID REFERENCES rework_items(id) ON DELETE CASCADE;

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_rework_items_project ON rework_items(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_rework_items_machine ON rework_items(machine_id);
CREATE INDEX IF NOT EXISTS idx_rework_items_defect ON rework_items(defect_id);
CREATE INDEX IF NOT EXISTS idx_rework_items_status ON rework_items(status);
CREATE INDEX IF NOT EXISTS idx_attachments_rework ON attachments(rework_id);
CREATE INDEX IF NOT EXISTS idx_controls_schematic_project ON controls_schematic_reworks(sales_order_id);
