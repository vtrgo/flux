#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# install_proxy_service.sh
#
# Packages and installs the vtrFlux standalone reverse proxy as a systemd service.
# Routes port 80 traffic to internal 8080 backend with zero SSE buffering.
#
# Usage:
#   ./scripts/install_proxy_service.sh [TARGET_USER]
#   ./scripts/install_proxy_service.sh --dry-run [TARGET_USER]
# -----------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DRY_RUN=0
REQUESTED_USER=""

# Parse arguments
for arg in "$@"; do
  if [ "$arg" == "--dry-run" ] || [ "$arg" == "-n" ]; then
    DRY_RUN=1
  elif [ -z "$REQUESTED_USER" ] && [[ "$arg" != -* ]]; then
    REQUESTED_USER="$arg"
  fi
done

# 1. User & Group Auto-detection
if [ -n "$REQUESTED_USER" ]; then
  TARGET_USER="$REQUESTED_USER"
elif id "electrical" >/dev/null 2>&1; then
  TARGET_USER="electrical"
elif id "justin" >/dev/null 2>&1; then
  TARGET_USER="justin"
elif [ -n "${SUDO_USER:-}" ] && id "$SUDO_USER" >/dev/null 2>&1; then
  TARGET_USER="$SUDO_USER"
else
  TARGET_USER="$(id -un)"
fi

if ! id "$TARGET_USER" >/dev/null 2>&1; then
  echo "[Error] Target user '$TARGET_USER' does not exist." >&2
  exit 1
fi

TARGET_GROUP="$(id -gn "$TARGET_USER")"

echo "== Target Service User: $TARGET_USER ($TARGET_GROUP) =="

# 2. Setup Sudo / Privilege handling
SUDO_CMD=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO_CMD="sudo"
  else
    if [ "$DRY_RUN" -eq 0 ]; then
      echo "[Error] Root privileges or sudo is required to install system service." >&2
      exit 1
    fi
  fi
fi

# 3. Compile Proxy Binary
echo "== [1/3] Compiling vtrFlux Reverse Proxy =="
BUILD_TMP="$(mktemp -d)"
cleanup() {
  rm -rf "$BUILD_TMP"
}
trap cleanup EXIT

(cd "$REPO_ROOT" && go build -o "$BUILD_TMP/vtrflux-proxy" ./cmd/proxy)
echo "Compiled binary successfully at $BUILD_TMP/vtrflux-proxy"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[Dry Run] Would install $BUILD_TMP/vtrflux-proxy to /usr/local/bin/vtrflux-proxy"
  echo "[Dry Run] Would run: setcap 'cap_net_bind_service=+ep' /usr/local/bin/vtrflux-proxy"
else
  echo "== [2/3] Installing binary to /usr/local/bin/vtrflux-proxy =="
  $SUDO_CMD install -m 755 "$BUILD_TMP/vtrflux-proxy" /usr/local/bin/vtrflux-proxy

  if command -v setcap >/dev/null 2>&1; then
    echo "== Assigning CAP_NET_BIND_SERVICE to /usr/local/bin/vtrflux-proxy =="
    $SUDO_CMD setcap 'cap_net_bind_service=+ep' /usr/local/bin/vtrflux-proxy
  else
    echo "[Warning] 'setcap' command not found. AmbientCapabilities in systemd unit will grant port 80 binding."
  fi
fi

# 4. Generate systemd Service Unit
SERVICE_FILE="/etc/systemd/system/vtrflux-proxy.service"

SERVICE_CONTENT="[Unit]
Description=vtrFlux Reverse Proxy (Port 80 -> 8080)
After=network.target vtrflux.service
Wants=network.target

[Service]
Type=simple
User=${TARGET_USER}
Group=${TARGET_GROUP}
ExecStart=/usr/local/bin/vtrflux-proxy
Restart=always
RestartSec=3
LimitNOFILE=65536
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
Environment=PROXY_PORT=80
Environment=TARGET_BACKEND=http://127.0.0.1:8080

[Install]
WantedBy=multi-user.target
"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "== [3/3] [Dry Run] Systemd Service Definition ($SERVICE_FILE) =="
  echo "$SERVICE_CONTENT"
  echo "[Dry Run] Installation completed successfully (no system modifications made)."
else
  echo "== [3/3] Writing $SERVICE_FILE =="
  echo "$SERVICE_CONTENT" | $SUDO_CMD tee "$SERVICE_FILE" >/dev/null
  $SUDO_CMD chmod 644 "$SERVICE_FILE"

  if command -v systemctl >/dev/null 2>&1; then
    echo "== Reloading systemd daemon =="
    $SUDO_CMD systemctl daemon-reload
    echo "== Service vtrflux-proxy.service installed successfully! =="
    echo "To enable and start immediately:"
    echo "  sudo systemctl enable --now vtrflux-proxy.service"
    echo "To check status:"
    echo "  systemctl status vtrflux-proxy.service"
  fi
fi
