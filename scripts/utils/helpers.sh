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

# Log function
log() {
  echo "$(date): $1" | tee -a "$LOG_FILE"
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

# Create or update systemd service
setup_systemd_service() {
  log "Configuring systemd service..."
  cat > /tmp/pluggedin.service << EOF
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

  # Install systemd service
  sudo mv /tmp/pluggedin.service /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl restart pluggedin.service
  sudo systemctl enable pluggedin.service
}

sudo systemctl status pluggedin.service --no-pager 