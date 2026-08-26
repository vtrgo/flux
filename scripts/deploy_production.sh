#!/usr/bin/env bash
# =============================================================================
# deploy_production.sh
#
# Production deployment and service restoration script for Flux MES.
#
# Usage:
#   sudo ./scripts/deploy_production.sh [VERSION_OR_TAG]
#
# Examples:
#   sudo ./scripts/deploy_production.sh           # In-place build & deployment from current directory
#   sudo ./scripts/deploy_production.sh v1.3.0    # Download, extract, migrate, build, and deploy v1.3.0
#   sudo ./scripts/deploy_production.sh latest    # Deploy the latest release from GitHub
# =============================================================================

set -euo pipefail

# Ensure script is run with sudo
if [ "$(id -u)" -ne 0 ]; then
  echo "[Error] deploy_production.sh must be executed with sudo privileges." >&2
  echo "Usage: sudo $0 $*" >&2
  exit 1
fi

FLUX_DIR="${FLUX_DIR:-/opt/flux}"
SERVICE_NAME="flux.service"
GITHUB_REPO="vtrgo/flux"
TARGET_PORT="${PORT:-80}"

# Auto-detect target user/group
if id "electrical" >/dev/null 2>&1; then
  SERVICE_USER="electrical"
elif [ -n "${SUDO_USER:-}" ] && id "$SUDO_USER" >/dev/null 2>&1; then
  SERVICE_USER="$SUDO_USER"
elif id "justin" >/dev/null 2>&1; then
  SERVICE_USER="justin"
else
  SERVICE_USER="$(id -un)"
fi
SERVICE_GROUP="$(id -gn "$SERVICE_USER")"

echo "========================================================"
echo "          Flux MES Production Deployment               "
echo "========================================================"
echo "Target Directory : $FLUX_DIR"
echo "Service Account  : $SERVICE_USER:$SERVICE_GROUP"
echo "Systemd Service  : $SERVICE_NAME"
echo "========================================================"

# 1. Check Node.js and Go paths (handling nvm or custom path under sudo)
if [ -d "/home/$SERVICE_USER/.nvm" ]; then
  export NVM_DIR="/home/$SERVICE_USER/.nvm"
  # shellcheck source=/dev/null
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

export PATH="$PATH:/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin"

command -v go >/dev/null 2>&1 || { echo "[Error] 'go' compiler is not in PATH." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "[Error] 'npm' is not in PATH." >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "[Error] 'node' is not in PATH." >&2; exit 1; }

echo "Using Go: $(go version)"
echo "Using Node: $(node --version)"

# 2. Optional: Download specific release tag from GitHub
RELEASE_TAG="${1:-}"
if [ -n "$RELEASE_TAG" ]; then
  if [ "$RELEASE_TAG" == "latest" ]; then
    echo "== [1/5] Resolving latest release tag from GitHub =="
    RELEASE_TAG=$(curl -sL "https://api.github.com/repos/$GITHUB_REPO/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' || echo "")
    if [ -z "$RELEASE_TAG" ]; then
      echo "[Warning] Could not resolve latest tag via GitHub API; falling back to main branch archive."
      TARBALL_URL="https://github.com/$GITHUB_REPO/archive/refs/heads/main.tar.gz"
    else
      echo "Resolved latest tag: $RELEASE_TAG"
      TARBALL_URL="https://github.com/$GITHUB_REPO/archive/refs/tags/${RELEASE_TAG}.tar.gz"
    fi
  else
    echo "== [1/5] Fetching release tag '$RELEASE_TAG' from GitHub =="
    TARBALL_URL="https://github.com/$GITHUB_REPO/archive/refs/tags/${RELEASE_TAG}.tar.gz"
  fi

  echo "Downloading: $TARBALL_URL"
  mkdir -p "$FLUX_DIR"
  curl -sL "$TARBALL_URL" | tar -xz -C "$FLUX_DIR" --strip-components=1 --overwrite
else
  echo "== [1/5] Performing in-place deployment from existing directory =="
  mkdir -p "$FLUX_DIR"
fi

# Ensure correct file permissions
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$FLUX_DIR"

# 3. Apply Database Migrations
echo "== [2/5] Enforcing Database Migrations =="
if [ -f "$FLUX_DIR/scripts/bootstrap_flux_db.sh" ]; then
  (cd "$FLUX_DIR" && DB_NAME="flux" bash ./scripts/bootstrap_flux_db.sh)
else
  echo "[Warning] bootstrap_flux_db.sh not found. Skipping migration step."
fi

# 4. Build Static Frontend
echo "== [3/5] Building Next.js Static Frontend Export =="
(
  cd "$FLUX_DIR/frontend"
  # Run as the service user to preserve node_modules permissions while passing current PATH/NVM
  if [ "$(id -u)" -eq 0 ] && [ "$SERVICE_USER" != "root" ]; then
    sudo -u "$SERVICE_USER" -H env "PATH=$PATH" "HOME=/home/$SERVICE_USER" bash -c "
      if [ -d \"/home/$SERVICE_USER/.nvm\" ]; then
        export NVM_DIR=\"/home/$SERVICE_USER/.nvm\"
        [ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\"
      fi
      cd '$FLUX_DIR/frontend'
      npm ci
      npm run build
    "
  else
    npm ci
    npm run build
  fi
)

# 5. Compile Embedded Go Executable
echo "== [4/5] Compiling Single Go Executable =="
mkdir -p "$FLUX_DIR/bin"
# Run go build under SERVICE_USER to leverage user's Go module and build cache
if [ "$(id -u)" -eq 0 ] && [ "$SERVICE_USER" != "root" ]; then
  sudo -u "$SERVICE_USER" -H env "PATH=$PATH" "HOME=/home/$SERVICE_USER" "GOCACHE=/home/$SERVICE_USER/.cache/go-build" "GOPATH=/home/$SERVICE_USER/go" bash -c "
    cd '$FLUX_DIR'
    go build -o '$FLUX_DIR/flux' cmd/flux/main.go
  "
else
  (cd "$FLUX_DIR" && go build -o "$FLUX_DIR/flux" cmd/flux/main.go)
fi
cp "$FLUX_DIR/flux" "$FLUX_DIR/bin/flux"
chown "$SERVICE_USER:$SERVICE_GROUP" "$FLUX_DIR/flux" "$FLUX_DIR/bin/flux"
chmod 755 "$FLUX_DIR/flux" "$FLUX_DIR/bin/flux"

# Ensure binary has capability to bind privileged port 80 if executed without systemd AmbientCapabilities
if command -v setcap >/dev/null 2>&1; then
  setcap 'cap_net_bind_service=+ep' "$FLUX_DIR/flux" 2>/dev/null || true
  setcap 'cap_net_bind_service=+ep' "$FLUX_DIR/bin/flux" 2>/dev/null || true
fi

# 6. Restart Service and Verify Health
echo "== [5/5] Restarting Service & Validating Health =="
if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload || true
  
  if systemctl cat "$SERVICE_NAME" >/dev/null 2>&1 || systemctl cat "flux" >/dev/null 2>&1; then
    echo "Restarting $SERVICE_NAME..."
    systemctl restart "$SERVICE_NAME"
    
    # Wait for startup and check health
    echo "Waiting for service to stabilize..."
    HEALTHY=0
    for i in {1..10}; do
      sleep 1
      if curl -sf "http://127.0.0.1:${TARGET_PORT}/api/machines" >/dev/null 2>&1 || \
         curl -sf "http://127.0.0.1:8080/api/machines" >/dev/null 2>&1; then
        HEALTHY=1
        break
      fi
    done

    if [ "$HEALTHY" -eq 1 ]; then
      echo "== [SUCCESS] Flux MES is online, healthy, and serving traffic on port $TARGET_PORT =="
    else
      echo "[Warning] Health check endpoint did not respond immediately. Checking service status:"
      systemctl status "$SERVICE_NAME" --no-pager
    fi
  else
    echo "[Notice] $SERVICE_NAME is not installed in systemd. Run manually with: $FLUX_DIR/flux"
  fi
else
  echo "[Notice] systemctl not found. Run binary directly: $FLUX_DIR/flux"
fi

echo "========================================================"
echo "          Deployment Completed Successfully!            "
echo "========================================================"
