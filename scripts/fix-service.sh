#!/bin/bash

# Import helper functions
SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
source "${SCRIPT_DIR}/utils/helpers.sh"

# Just run the service setup function
setup_systemd_service

# Check status
sudo systemctl status pluggedin.service 