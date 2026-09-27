#!/usr/bin/env bash
# Move the self-hosted Actions runner off the `pluggedin` account and onto a
# dedicated user with a ROOTLESS Docker daemon.
#
#   sudo bash infra/scripts/isolate-gha-runner.sh
#
# WHY ROOTLESS, and why "separate user" alone is not enough:
#
#   The runner executes workflow code on the production host. Today it runs as
#   `pluggedin`, which can read /etc/sops/age/keys.txt (mode 0440 root:pluggedin),
#   read /run/sops/secrets.env in plaintext, and is in the `docker` group.
#
#   Moving it to a new user in the `docker` group closes the first two and
#   NOTHING else, because the docker group is root-equivalent:
#
#       docker run -v /etc/sops/age:/host:ro alpine cat /host/keys.txt
#
#   That one line defeats the whole exercise, and it is available to any member
#   of the group. Verified on this host before writing this script.
#
#   A rootless daemon has no such escape: it runs as the runner user inside a
#   user namespace, so a container it starts cannot read files that user cannot
#   read. That is a real boundary rather than a cosmetic one.
#
# The build still works: buildx runs fine rootless, the image is pushed to GHCR,
# and the production stack keeps using the system daemon as before.
#
# NOT a substitute for moving the runner to a separate machine. It removes the
# secret-and-root exposure; it does not remove the runner's presence on the box
# that serves production. Treat it as the interim step it is.

set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run me with sudo" >&2; exit 1; }

RUNNER_USER="${RUNNER_USER:-ghrunner}"
OLD_HOME="/home/pluggedin/actions-runner"
NEW_HOME="/home/${RUNNER_USER}/actions-runner"
RUNNER_NAME="${RUNNER_USER}-rootless"
# The unit name the runner's own svc.sh would derive for this repo + name.
SVC_PREFIX="actions.runner.VeriTeknik-pluggedin-app."
SVC="${SVC_PREFIX}${RUNNER_NAME}.service"
UNIT_DIR="/etc/systemd/system"

# ROOT NEVER EXECUTES OR CONSUMES ANYTHING FROM A RUNNER-WRITABLE DIRECTORY.
#
# The runner's svc.sh, its bin/ unit template and runsvc.sh all live in the
# runner's home, which that account can rewrite — and it runs workflow code.
# An earlier version ran `./svc.sh install|start` (and the old runner's
# `./svc.sh uninstall`) as root, so a job that compromised the runner account
# could replace svc.sh and get root the next time an operator re-ran this
# script. Everything privileged below is done by this script's own code with
# systemctl and a unit file written from a fixed template. Anything that has
# to touch the runner's files is done AS the runner account (sudo -u).

# ---------------------------------------------------------------------------
# PREFLIGHT — every requirement is checked BEFORE anything is stopped.
#
# An earlier version checked only for dockerd-rootless-setuptool.sh, stopped
# and uninstalled the production runner, and only then discovered that
# newuidmap/newgidmap were missing. That left CI with no runner at all and
# nothing installed to replace it. Nothing below this block is destructive;
# nothing above it is skippable.
# ---------------------------------------------------------------------------
missing=()
command -v dockerd-rootless-setuptool.sh >/dev/null || missing+=("docker-ce-rootless-extras")
# uidmap provides newuidmap/newgidmap, without which the user namespace the
# rootless daemon depends on cannot be set up.
command -v newuidmap >/dev/null || missing+=("uidmap")
command -v newgidmap >/dev/null || missing+=("uidmap")
command -v rootlesskit >/dev/null || missing+=("rootlesskit")
# fuse-overlayfs is NOT required and must not gate the run. Kernels from 5.11
# support rootless overlayfs natively — this host is on 6.8 and the daemon
# reports storage-driver=overlayfs without using fuse-overlayfs at all. It
# only matters on older kernels, where its absence drops the daemon to the vfs
# driver, which copies every layer and makes a 4 GB build slow and
# disk-hungry. An earlier version of this block listed it as optional in the
# comment and then enforced it as mandatory in the code, which would have
# refused to run on exactly the modern systems that do not need it.

if [ ${#missing[@]} -gt 0 ]; then
  # shellcheck disable=SC2207
  uniq_missing=($(printf '%s\n' "${missing[@]}" | sort -u))
  echo "Missing prerequisites — install these first, then re-run:" >&2
  echo >&2
  echo "  sudo apt-get update && sudo apt-get install -y ${uniq_missing[*]}" >&2
  echo >&2
  echo "Nothing has been changed. The existing runner is untouched." >&2
  exit 1
fi

# Also confirm unprivileged user namespaces are permitted at all; on some
# hardened kernels they are disabled outright and rootless simply cannot work.
if [ -r /proc/sys/kernel/unprivileged_userns_clone ]; then
  [ "$(cat /proc/sys/kernel/unprivileged_userns_clone)" = "1" ] \
    || { echo "unprivileged user namespaces are disabled; rootless cannot work here" >&2; exit 1; }
fi

if ! command -v fuse-overlayfs >/dev/null; then
  kmaj=$(uname -r | cut -d. -f1); kmin=$(uname -r | cut -d. -f2)
  if [ "$kmaj" -gt 5 ] || { [ "$kmaj" -eq 5 ] && [ "$kmin" -ge 11 ]; }; then
    echo "note: fuse-overlayfs absent; kernel $(uname -r) has native rootless overlayfs, so it is not needed"
  else
    echo "WARNING: fuse-overlayfs absent and kernel $(uname -r) predates native rootless overlayfs." >&2
    echo "         The daemon will fall back to the vfs driver: correct, but slow and disk-hungry." >&2
    echo "         Install it with: apt-get install -y fuse-overlayfs" >&2
  fi
fi

echo "==> preflight ok: rootless prerequisites present"

echo "==> 1. stop and unregister the existing runner"
# Every runner unit for this repo is stopped. The previous runner's unit is
# also disabled and removed — with systemctl and rm on the root-owned unit
# directory, NOT by running its svc.sh, which sits in a directory the old
# runner account could rewrite. The new runner's own unit (present on a
# re-run) is only stopped here; step 5 rewrites and restarts it.
while IFS= read -r unit; do
  [ -n "$unit" ] || continue
  systemctl stop "$unit" || true
  if [ "$unit" != "$SVC" ]; then
    systemctl disable "$unit" 2>/dev/null || true
    rm -f "${UNIT_DIR:?}/${unit}"
    echo "    stopped and removed ${unit}"
  else
    echo "    stopped ${unit} (reinstalled in step 5)"
  fi
done < <(systemctl list-units --all --plain --no-legend "${SVC_PREFIX}*" | awk '{print $1}')
systemctl daemon-reload
# svc.sh uninstall also deleted the old runner's `.service` marker, without
# which `config.sh remove` refuses to run. Delete it as that directory's
# owner, never as root, and never through a symlinked directory.
if [ -d "$OLD_HOME" ] && [ ! -L "$OLD_HOME" ]; then
  sudo -u "$(stat -c %U "$OLD_HOME")" rm -f "${OLD_HOME}/.service" || true
fi
cat <<'MSG'
    NOTE: the old runner is still registered with GitHub. Remove it at
    Settings -> Actions -> Runners, or run, as pluggedin:
      cd /home/pluggedin/actions-runner && ./config.sh remove --token <REMOVE_TOKEN>
    A fresh registration token is needed below either way; tokens expire in 1h.
MSG

echo "==> 2. create ${RUNNER_USER} — deliberately NOT in the docker group"
if ! id -u "$RUNNER_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$RUNNER_USER"
fi
# Lingering lets the rootless daemon run without an active login session.
loginctl enable-linger "$RUNNER_USER"
# Subuid/subgid ranges are what make the user namespace possible.
#
# useradd normally allocates these itself, and when it does the guard below
# short-circuits and nothing here runs — on this host it assigned 165536, not
# the range an earlier version of this script hardcoded, so that constant was
# never actually applied. It was still wrong to carry: on a system whose
# useradd does not auto-allocate, a fixed range can collide with one already
# issued to another user, and overlapping ranges produce rootless failures
# that are hard to trace back to their cause.
#
# Derive the next free range from what is already allocated instead.
next_free_subid() {
  local file="$1" size=65536 highest=0 start count end
  while IFS=: read -r _ start count; do
    [ -n "${start:-}" ] || continue
    end=$((start + count))
    [ "$end" -gt "$highest" ] && highest=$end
  done < "$file"
  # Stay clear of real uids; 100000 is the conventional floor.
  [ "$highest" -lt 100000 ] && highest=100000
  echo "${highest}-$((highest + size - 1))"
}

if ! grep -q "^${RUNNER_USER}:" /etc/subuid; then
  range=$(next_free_subid /etc/subuid)
  usermod --add-subuids "$range" "$RUNNER_USER"
  echo "    allocated subuid range ${range}"
fi
if ! grep -q "^${RUNNER_USER}:" /etc/subgid; then
  range=$(next_free_subid /etc/subgid)
  usermod --add-subgids "$range" "$RUNNER_USER"
  echo "    allocated subgid range ${range}"
fi

echo "==> 3. confirm the isolation actually holds"
fail=0
sudo -u "$RUNNER_USER" test -r /etc/sops/age/keys.txt && { echo "    FAIL: can read the age key"; fail=1; } || echo "    ok: cannot read /etc/sops/age/keys.txt"
sudo -u "$RUNNER_USER" test -r /run/sops/secrets.env && { echo "    FAIL: can read decrypted secrets"; fail=1; } || echo "    ok: cannot read /run/sops/secrets.env"
id -nG "$RUNNER_USER" | tr ' ' '\n' | grep -qx docker && { echo "    FAIL: in the docker group — this defeats the point"; fail=1; } || echo "    ok: not in the docker group"
[ "$fail" -eq 0 ] || { echo "isolation checks failed; not continuing" >&2; exit 1; }

echo "==> 4. install the rootless docker daemon for ${RUNNER_USER}"
sudo -u "$RUNNER_USER" XDG_RUNTIME_DIR="/run/user/$(id -u "$RUNNER_USER")" \
  dockerd-rootless-setuptool.sh install --skip-iptables || {
    echo "    rootless install failed — see the output above" >&2; exit 1; }

echo "==> 5. install and register the runner"
#
# Done here rather than handed to the operator as copy-paste. The manual
# version had two defects: it left <REGISTRATION_TOKEN> as a placeholder that
# is easy to paste literally, and it told the operator to run
# `sudo ./svc.sh install` from inside ${RUNNER_USER}'s shell — which cannot
# work, because that account deliberately has no sudo rights. This script is
# already root, so it does the privileged half itself — with its own code, not
# the runner's svc.sh (see the note at the top).
RUNNER_VERSION="${RUNNER_VERSION:-2.328.0}"
RUNNER_TARBALL_SHA256="${RUNNER_TARBALL_SHA256:-}"  # optional pin; checked if set
TARBALL="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
RUNNER_UID="$(id -u "$RUNNER_USER")"
DOCKER_SOCK="unix:///run/user/${RUNNER_UID}/docker.sock"

# The runner home is created BY the runner account, and refused if it is a
# symlink or someone else's: an earlier `install -d -o ...` run as root would
# have chowned whatever a planted symlink pointed at.
if [ -L "$NEW_HOME" ]; then
  echo "${NEW_HOME} is a symlink; refusing to use it" >&2; exit 1
fi
[ -d "$NEW_HOME" ] || sudo -u "$RUNNER_USER" mkdir -p "$NEW_HOME"
if [ "$(stat -c %U "$NEW_HOME")" != "$RUNNER_USER" ]; then
  echo "${NEW_HOME} is not owned by ${RUNNER_USER}; refusing to use it" >&2; exit 1
fi

if [ -f "${NEW_HOME}/.runner" ]; then
  # config.sh refuses to configure an already-configured runner, so a re-run
  # (e.g. to reinstall the unit below) keeps the existing registration.
  echo "    ${RUNNER_NAME} already registered; keeping the registration"
  echo "    (to re-register: as ${RUNNER_USER}, ./config.sh remove --token <REMOVE_TOKEN>, then re-run)"
else
  if [ -z "${RUNNER_TOKEN:-}" ]; then
    cat >&2 <<MSG

Set RUNNER_TOKEN and re-run. Get a fresh one (valid ~1h) from:
  Settings -> Actions -> Runners -> New self-hosted runner
  (copy the value after --token in the ./config.sh line GitHub shows)

  sudo RUNNER_TOKEN=XXXX bash infra/scripts/isolate-gha-runner.sh

Everything up to this point is already done and is safe to re-run.
MSG
    exit 1
  fi

  if [ ! -x "${NEW_HOME}/config.sh" ]; then
    sudo -u "$RUNNER_USER" curl -fsSL -o "${NEW_HOME}/${TARBALL}" \
      "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${TARBALL}"
    if [ -n "$RUNNER_TARBALL_SHA256" ]; then
      echo "${RUNNER_TARBALL_SHA256}  ${NEW_HOME}/${TARBALL}" | sha256sum -c -
    fi
    sudo -u "$RUNNER_USER" tar xzf "${NEW_HOME}/${TARBALL}" -C "$NEW_HOME"
    sudo -u "$RUNNER_USER" rm -f "${NEW_HOME}/${TARBALL}"
  fi

  # Unattended registration as the runner user. --replace takes over the name
  # if a stale registration is still present.
  sudo -u "$RUNNER_USER" env DOCKER_HOST="$DOCKER_SOCK" \
    "${NEW_HOME}/config.sh" \
      --url "https://github.com/VeriTeknik/pluggedin-app" \
      --token "$RUNNER_TOKEN" \
      --name "$RUNNER_NAME" \
      --labels self-hosted,linux,x64,plugged-in-prod \
      --unattended --replace
fi

# What svc.sh install did, minus running anything the runner can write:
#  - runsvc.sh is copied into place AS the runner (svc.sh did this as root,
#    and root writing into a runner-owned directory follows planted symlinks);
#  - the unit is rendered from the fixed template below, not from the
#    runner-writable bin/actions.runner.service.template;
#  - the unit and its drop-in are root-owned 0644 in a root-only directory.
# The unit runs runsvc.sh as ${RUNNER_USER}, so the runner being able to edit
# runsvc.sh gains it nothing it does not already have.
sudo -u "$RUNNER_USER" cp "${NEW_HOME}/bin/runsvc.sh" "${NEW_HOME}/runsvc.sh"
sudo -u "$RUNNER_USER" chmod 0755 "${NEW_HOME}/runsvc.sh"
# config.sh remove checks for this marker to insist the service is removed
# first; svc.sh wrote it, so keep writing it (as the runner).
printf '%s\n' "$SVC" | sudo -u "$RUNNER_USER" tee "${NEW_HOME}/.service" >/dev/null

echo "    installing ${SVC}"
unit_tmp="$(mktemp "${UNIT_DIR}/.${SVC}.XXXXXX")"
cat > "$unit_tmp" <<EOF
[Unit]
Description=GitHub Actions Runner (VeriTeknik-pluggedin-app.${RUNNER_NAME})
After=network.target

[Service]
ExecStart=${NEW_HOME}/runsvc.sh
User=${RUNNER_USER}
WorkingDirectory=${NEW_HOME}
KillMode=process
KillSignal=SIGTERM
TimeoutStopSec=5min

[Install]
WantedBy=multi-user.target
EOF
chown root:root "$unit_tmp"
chmod 0644 "$unit_tmp"
mv -f "$unit_tmp" "${UNIT_DIR}/${SVC}"

# DOCKER_HOST has to reach the service, or every build talks to the SYSTEM
# daemon and the isolation this whole script exists for is silently undone.
# The unit name is fixed above from the runner NAME we registered, not taken
# from "whatever actions.runner unit sorts first" — that could have selected
# a stale unit, put the drop-in on it, verified the same wrong unit and
# passed, while the real runner quietly built against the SYSTEM daemon.
echo "    configuring ${SVC}"
install -d -m 0755 -o root -g root "${UNIT_DIR}/${SVC}.d"
dropin_tmp="$(mktemp "${UNIT_DIR}/${SVC}.d/.10-rootless-docker.conf.XXXXXX")"
cat > "$dropin_tmp" <<EOF
[Service]
Environment=DOCKER_HOST=${DOCKER_SOCK}
EOF
chmod 0644 "$dropin_tmp"
mv -f "$dropin_tmp" "${UNIT_DIR}/${SVC}.d/10-rootless-docker.conf"
systemctl daemon-reload
systemctl enable "$SVC"
systemctl restart "$SVC"

echo "==> 6. verify"
sleep 5
systemctl is-active "$SVC" >/dev/null && echo "    ok: ${SVC} active" || { echo "    FAIL: service not active"; exit 1; }
if systemctl show "$SVC" -p Environment | grep -q "${DOCKER_SOCK}"; then
  echo "    ok: service points at the rootless daemon"
else
  echo "    FAIL: DOCKER_HOST not in the service environment — builds would use the system daemon" >&2
  exit 1
fi
# The point of the exercise: the runner's docker must not be able to read
# host secrets. Root can, so this is checked as the runner user.
if sudo -u "$RUNNER_USER" env DOCKER_HOST="$DOCKER_SOCK" \
     docker run --rm -v /etc/sops/age:/host:ro alpine cat /host/keys.txt >/dev/null 2>&1; then
  echo "    FAIL: rootless docker could read the age key — isolation is NOT holding" >&2
  exit 1
else
  echo "    ok: rootless docker cannot read /etc/sops/age/keys.txt"
fi

echo
echo "==> done. Remove the stale 'pluggedin' runner at"
echo "    Settings -> Actions -> Runners once a build has gone green."
echo "    Old directory kept at ${OLD_HOME} for rollback."
