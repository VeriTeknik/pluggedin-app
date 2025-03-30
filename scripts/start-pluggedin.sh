#!/bin/bash

# Exit on any error
set -e

# Import helper functions
SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
source "${SCRIPT_DIR}/utils/helpers.sh"

# Main script starts here
ensure_log_dir
log "Starting Plugged.in application setup..."

# Create app directory if it doesn't exist
mkdir -p $APP_DIR
cd $APP_DIR

# Clone or update application code
if [ -d ".git" ]; then
  log "Updating application code..."
  git pull
else
  log "Cloning application code..."
  git clone https://github.com/VeriTeknik/pluggedin-app.git .
fi

# Ensure required software is installed
ensure_nodejs
ensure_pnpm

# Install dependencies
log "Installing application dependencies..."
pnpm install

# Run database migrations
log "Running database migrations..."
pnpm db:migrate:auth
pnpm db:generate
pnpm db:migrate

# Build the application
log "Building application..."
NODE_ENV=production pnpm build

# Copy standalone build files
log "Setting up standalone build..."
rm -rf .next/standalone
cp -r .next/standalone .next/
cp -r .next/static .next/standalone/
cp -r public .next/standalone/
cp .env .next/standalone/

# Setup and start the systemd service
setup_systemd_service

log "Plugged.in application is now running on port 12005"
