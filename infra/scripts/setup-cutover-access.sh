#!/usr/bin/env bash
# One-time privileged setup so the cutover can run without escalating for
# anything except stopping/starting the two native services.
#
#   sudo bash infra/scripts/setup-cutover-access.sh
#
# Pair it with infra/sudoers/pluggedin-cutover, installed via
# `sudo visudo -f /etc/sudoers.d/pluggedin-cutover`.
#
# Everything here is idempotent and re-runnable.

set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run me with sudo" >&2; exit 1; }

OWNER="${DEPLOY_USER:-pluggedin}"
id "$OWNER" >/dev/null 2>&1 || { echo "no such user: $OWNER" >&2; exit 1; }

# 1. Decrypted secrets land here at deploy time. /run is tmpfs, which is the
#    point — the plaintext never touches disk. deploy.sh creates the
#    directory, but creating anything in /run needs root, so pre-make it
#    owned by the deploy account.
install -d -m 0700 -o "$OWNER" -g "$OWNER" /run/sops

# 2. /run is cleared on reboot, so make the directory reappear automatically
#    rather than silently breaking the first deploy after a restart.
cat > /etc/tmpfiles.d/pluggedin.conf <<EOF
# type path      mode uid       gid       age argument
d      /run/sops 0700 ${OWNER}  ${OWNER}  -
EOF
systemd-tmpfiles --create /etc/tmpfiles.d/pluggedin.conf

# 3. Cutover dumps land here (cutover-full.dump, cutover-final.dump). Those
#    are the rollback inputs, so they must outlive the containers;
#    /var/backups is root-owned.
install -d -m 0750 -o "$OWNER" -g "$OWNER" /var/backups/pluggedin

# 4. Let the deploy account read the age key at its canonical path, so
#    deploy.sh needs no SOPS_AGE_KEY_FILE override and there is exactly one
#    authoritative copy of the key on the box.
#
#    This is not a new exposure: "$OWNER" is in the `docker` group, which is
#    already root-equivalent here (docker socket -> mount / -> root). What it
#    does buy is the ability to delete the duplicate under ~/.config/sops —
#    fewer copies of the key is a real improvement.
if [ -f /etc/sops/age/keys.txt ]; then
  chgrp "$OWNER" /etc/sops/age /etc/sops/age/keys.txt
  chmod 0750     /etc/sops/age
  chmod 0440     /etc/sops/age/keys.txt
else
  echo "WARN: /etc/sops/age/keys.txt not found — deploy.sh will need" >&2
  echo "      SOPS_AGE_KEY_FILE pointed at wherever the key actually is." >&2
fi

echo
echo "ok:"
ls -ld /run/sops /var/backups/pluggedin
[ -f /etc/sops/age/keys.txt ] && ls -l /etc/sops/age/keys.txt
echo
echo "Next:"
echo "  sudo visudo -f /etc/sudoers.d/pluggedin-cutover"
echo "  # paste infra/sudoers/pluggedin-cutover, then confirm with:"
echo "  sudo -n systemctl show pluggedin --property=ActiveState"
