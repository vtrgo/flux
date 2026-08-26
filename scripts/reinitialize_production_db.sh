#!/usr/bin/env bash
# =============================================================================
# reinitialize_production_db.sh
#
# DANGEROUS: Wipes the production database and completely re-initializes it from scratch.
# This script should be used with extreme caution.
#
# Usage:
#   sudo ./scripts/reinitialize_production_db.sh --confirm
# =============================================================================

set -euo pipefail

# Ensure script is run with sudo
if [ "$(id -u)" -ne 0 ]; then
  echo "[Error] This script must be executed with sudo privileges." >&2
  exit 1
fi

if [ "${1:-}" != "--confirm" ]; then
  echo "====================================================================="
  echo " WARNING: THIS WILL COMPLETELY DESTROY THE PRODUCTION DATABASE"
  echo "====================================================================="
  echo "If you are absolutely sure you want to drop and recreate the"
  echo "'flux' database, run this script with the --confirm flag."
  echo ""
  echo "Usage: sudo $0 --confirm"
  exit 1
fi

DB_NAME="${DB_NAME:-flux}"

echo "== [1/3] Terminating active connections to '$DB_NAME' =="
sudo -u postgres psql -c "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = '$DB_NAME' AND pid <> pg_backend_pid();" > /dev/null 2>&1 || true

echo "== [2/3] Dropping database '$DB_NAME' =="
sudo -u postgres dropdb "$DB_NAME" || {
  echo "[Warning] Database '$DB_NAME' did not exist or could not be dropped."
}

echo "== [3/3] Running Database Bootstrap Script =="
# This will recreate the database and run all migrations
DB_NAME="$DB_NAME" ./scripts/bootstrap_flux_db.sh

echo "========================================================"
echo "          Database Re-initialization Complete!          "
echo "========================================================"
