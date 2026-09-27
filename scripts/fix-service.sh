#!/bin/bash

# Abort on the first failure: this script ends in privileged systemd changes,
# so a failed step must never fall through to the next one.
set -euo pipefail

# Import helper functions
SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
# shellcheck source-path=SCRIPTDIR source=utils/helpers.sh
source "${SCRIPT_DIR}/utils/helpers.sh"

# Just run the service setup function. Checked explicitly as well: a function
# called in a condition runs without errexit, and setup_systemd_service
# reports its own failures through its return status.
if ! setup_systemd_service; then
  echo "fix-service: service setup failed at the step logged above; stopping" >&2
  exit 1
fi

# Check status
sudo systemctl status pluggedin.service
