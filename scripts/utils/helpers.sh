#!/bin/bash

# Application details
APP_DIR="/home/pluggedin/pluggedin-app"
LOG_DIR="/var/log/pluggedin"
LOG_FILE="${LOG_DIR}/pluggedin_app.log"

# Ensure log directory exists
ensure_log_dir() {
  mkdir -p $LOG_DIR
  touch $LOG_FILE
  chmod 644 $LOG_FILE
}

# Log function. A log file we cannot append to must not abort a caller running
# under `set -e` (tee still prints to stdout).
log() {
  echo "$(date): $1" | tee -a "$LOG_FILE" || true
}

# Check and install Node.js if needed
ensure_nodejs() {
  if ! command -v node &> /dev/null; then
    log "Installing Node.js LTS..."
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
    sudo apt-get update
    sudo apt-get install -y nodejs
  fi
}

# Check and install pnpm if needed
ensure_pnpm() {
  if ! command -v pnpm &> /dev/null; then
    log "Installing pnpm..."
    sudo npm install -g pnpm
  fi
}

# Create or update systemd service.
#
# The unit is rendered into a private mktemp directory and installed with
# explicit root ownership; every step is checked and the function returns
# non-zero on the first failure, without touching systemd.
#
# It used to write a fixed /tmp/pluggedin.service and then `sudo mv` it into
# place unconditionally. Any local user could pre-create that path with a
# unit of their own (e.g. no User=, so it runs as root) and make it
# unwritable; the redirect failed, nothing stopped, and sudo installed and
# started the attacker's unit — `mv` even kept the attacker as its owner.
setup_systemd_service() {
  log "Configuring systemd service..."
  local tmpdir unit
  # mktemp -d creates a fresh 0700 directory with O_EXCL semantics, so no
  # other account can have pre-created or planted anything inside it.
  tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/pluggedin-service.XXXXXXXX")" || {
    log "ERROR: could not create a private temp directory"; return 1; }
  unit="${tmpdir}/pluggedin.service"
  if ! cat > "$unit" << EOF
[Unit]
Description=Plugged.in Application Service
After=network.target postgresql.service
Wants=postgresql.service

[Service]
User=pluggedin
Group=pluggedin
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node .next/standalone/server.js
Restart=on-failure
RestartSec=10
StandardOutput=append:${LOG_FILE}
StandardError=append:${LOG_FILE}
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
Environment=PORT=12005

[Install]
WantedBy=multi-user.target
EOF
  then
    log "ERROR: failed to write the service unit"; rm -rf "$tmpdir"; return 1
  fi
  # Refuse to install anything that is not the unit rendered above.
  if ! grep -qx 'User=pluggedin' "$unit" || ! grep -q '^ExecStart=' "$unit"; then
    log "ERROR: rendered service unit is incomplete; not installing it"; rm -rf "$tmpdir"; return 1
  fi

  # Install systemd service: `install` writes a fresh root:root 0644 copy,
  # whatever the temp file's owner was.
  if ! sudo install -m 0644 -o root -g root "$unit" /etc/systemd/system/pluggedin.service; then
    log "ERROR: failed to install /etc/systemd/system/pluggedin.service"; rm -rf "$tmpdir"; return 1
  fi
  rm -rf "$tmpdir"
  sudo systemctl daemon-reload || { log "ERROR: systemctl daemon-reload failed"; return 1; }
  sudo systemctl restart pluggedin.service || { log "ERROR: failed to restart pluggedin.service"; return 1; }
  sudo systemctl enable pluggedin.service || { log "ERROR: failed to enable pluggedin.service"; return 1; }
}

# Runs whenever this file is sourced. Non-fatal: callers use `set -e`, and a
# stopped or missing service (the reason to run fix-service.sh at all) makes
# `systemctl status` exit non-zero.
sudo systemctl status pluggedin.service --no-pager || true