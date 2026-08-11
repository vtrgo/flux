#!/usr/bin/env bash
# Script to initialize, provision, and verify the vtrFlux PostgreSQL relational infrastructure.

set -euo pipefail

DB_NAME="flux"
SCHEMA_PATH="/tmp/flux_schema.sql"

# Identify the original user even if run via sudo
TARGET_USER="${SUDO_USER:-$USER}"

echo "== [1/4] Verifying Local PostgreSQL Instance State =="
if ! pg_isready -q; then
    echo "PostgreSQL service is not running. Attempting to start..."
    sudo service postgresql start
    sleep 2
fi

echo "== [2/4] Initializing Logical Database Storage =="
# Check if db exists as the postgres user. We cd to /tmp to prevent the postgres user from complaining about directory permissions in /home
if (cd /tmp && sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"); then
    echo "Database '$DB_NAME' already exists. We will wipe and re-apply."
    (cd /tmp && sudo -u postgres psql -d postgres -c "DROP DATABASE \"$DB_NAME\"")
fi

echo "Creating database '$DB_NAME' with owner '$TARGET_USER'..."
(cd /tmp && sudo -u postgres createdb -O "$TARGET_USER" "$DB_NAME")


echo "== [3/4] Enforcing Relational Schema Structures =="
cat << 'EOF' > "$SCHEMA_PATH"
-- Core Entity
CREATE TABLE machines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(100) UNIQUE NOT NULL,
    model_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'kitting',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Kitting
CREATE TABLE kitting_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
    department VARCHAR(50) NOT NULL,
    part_number VARCHAR(100) NOT NULL,
    description TEXT,
    qty_required INT NOT NULL,
    qty_picked INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    fulfilled_at TIMESTAMPTZ,
    fulfilled_by VARCHAR(100)
);

-- Assembly
CREATE TABLE assembly_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
    task_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    signed_off_by VARCHAR(100),
    notes TEXT
);

-- Controls
CREATE TABLE controls_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
    checkpoint_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    expected_value VARCHAR(255),
    actual_value VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    signed_off_by VARCHAR(100),
    signed_off_at TIMESTAMPTZ
);

-- Quality
CREATE TABLE quality_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
    inspection_type VARCHAR(50) NOT NULL,
    inspector_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'in_progress',
    completed_at TIMESTAMPTZ
);

CREATE TABLE defects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
    inspection_id UUID REFERENCES quality_inspections(id),
    source_department VARCHAR(50) NOT NULL,
    assigned_department VARCHAR(50),
    description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    notes TEXT,
    resolved_by VARCHAR(100),
    resolved_at TIMESTAMPTZ
);

CREATE TABLE machine_shop_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
    defect_id UUID REFERENCES defects(id) ON DELETE SET NULL,
    part_name VARCHAR(100) NOT NULL,
    material VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    machined_by VARCHAR(100),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


-- Design (The Origin & Feedback Destination)
CREATE TABLE design_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL,
    version VARCHAR(20) NOT NULL,
    file_url TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    uploaded_by VARCHAR(100),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE design_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
    document_id UUID REFERENCES design_documents(id) ON DELETE SET NULL,
    source_department VARCHAR(50) NOT NULL,
    feedback_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
EOF

echo "Applying schema to '$DB_NAME'..."
(cd /tmp && sudo -u postgres psql -d "$DB_NAME" < "$SCHEMA_PATH")

# Fix permissions so the API user can actually access the tables created by the postgres role
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"$TARGET_USER\";"
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO \"$TARGET_USER\";"
sudo -u postgres psql -d "$DB_NAME" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO \"$TARGET_USER\";"


echo "== [4/4] Running Target Baseline Diagnostics =="
echo "Verifying structural allocation for tables:"
(cd /tmp && sudo -u postgres psql -d "$DB_NAME" -c "\dt")

# Copy the schema file back to the project directory for tracking purposes
cp "$SCHEMA_PATH" "scripts/schema.sql"

echo "== [Success] Database engine fully initialized and ready for application attachment =="
