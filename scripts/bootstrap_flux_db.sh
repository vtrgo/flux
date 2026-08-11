#!/usr/bin/env bash
# Script to initialize, provision, and verify the vtrFlux PostgreSQL relational infrastructure.

set -euo pipefail

DB_NAME="flux"
MIGRATIONS_DIR="scripts/migrations"

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
    echo "Database '$DB_NAME' already exists. We will NOT drop it, preserving data."
else
    echo "Creating database '$DB_NAME' with owner '$TARGET_USER'..."
    (cd /tmp && sudo -u postgres createdb -O "$TARGET_USER" "$DB_NAME")
fi

echo "== [3/4] Enforcing Relational Schema Structures (Migrations) =="
# Create migration tracking table if it doesn't exist
sudo -u postgres psql -d "$DB_NAME" -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);"

# Iterate over all .up.sql files and apply them if not already applied
for migration_file in $(ls -v "$MIGRATIONS_DIR"/*.up.sql); do
    version=$(basename "$migration_file" .up.sql)
    
    # Check if this migration was already applied
    is_applied=$(sudo -u postgres psql -d "$DB_NAME" -tAc "SELECT 1 FROM schema_migrations WHERE version = '$version';")
    
    # Legacy handling: if machines exists but migrations don't, assume init migration is applied
    if [ "$is_applied" != "1" ] && [ "$version" == "000001_init_mes_schema" ]; then
        if sudo -u postgres psql -d "$DB_NAME" -tAc "SELECT 1 FROM pg_tables WHERE tablename = 'machines';" | grep -q 1; then
            echo "Legacy database detected with tables. Marking migration 000001_init_mes_schema as already applied."
            sudo -u postgres psql -d "$DB_NAME" -c "INSERT INTO schema_migrations (version) VALUES ('$version');"
            is_applied="1"
        fi
    fi
    
    if [ "$is_applied" != "1" ]; then
        echo "Applying migration: $version..."
        # Apply the migration
        sudo -u postgres psql -d "$DB_NAME" -f "$migration_file"
        # Record it
        sudo -u postgres psql -d "$DB_NAME" -c "INSERT INTO schema_migrations (version) VALUES ('$version');"
    else
        echo "Migration already applied: $version. Skipping."
    fi
done

# Fix permissions so the API user can actually access the tables created by the postgres role
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"$TARGET_USER\";"
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO \"$TARGET_USER\";"
sudo -u postgres psql -d "$DB_NAME" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO \"$TARGET_USER\";"


echo "== [4/4] Running Target Baseline Diagnostics =="
echo "Verifying structural allocation for tables:"
sudo -u postgres psql -d "$DB_NAME" -c "\dt"

echo "== [Success] Database engine fully initialized and ready for application attachment =="
