#!/usr/bin/env bash
# Set up a self-hosted GitHub Actions runner on the prod host so that the
# image-build job in .github/workflows/build-image.yml can run on a CPU
# that actually has the AVX2/AVX-512 instructions the @zvec/zvec native
# binding ships. GitHub-hosted runners hit SIGILL inconsistently on the
# binding's SIMD code paths.
#
# After this script finishes, the runner shows up under
# Settings → Actions → Runners on the GitHub repo, and the `build` job
# (gated to `runs-on: [self-hosted, plugged-in-prod]` once you flip the
# label, see the workflow patch below) picks it up automatically.
#
# Idempotent: re-running detects an existing install and is a no-op.
#
# Usage:
#   1. Open https://github.com/VeriTeknik/pluggedin-app/settings/actions/runners/new
#      Pick Linux x64. Copy the `--token <REGISTRATION_TOKEN>` value.
#   2. RUNNER_TOKEN=<token from step 1> infra/scripts/setup-gha-runner.sh
#
# The script does NOT need sudo for the runner itself (lives under
# /home/pluggedin/actions-runner). It uses sudo only to install the
# runner's optional systemd service. If you skip the systemd step (set
# NO_SYSTEMD=1), you can also run the runner under your existing
# supervision system.

set -euo pipefail

RUNNER_DIR="${RUNNER_DIR:-/home/pluggedin/actions-runner}"
RUNNER_VERSION="${RUNNER_VERSION:-2.330.0}"
RUNNER_TARBALL_SHA256="${RUNNER_TARBALL_SHA256:-}"  # optional pin; checked if set
RUNNER_LABEL="${RUNNER_LABEL:-plugged-in-prod}"
RUNNER_NAME="${RUNNER_NAME:-$(hostname -s)}"
REPO_URL="${REPO_URL:-https://github.com/VeriTeknik/pluggedin-app}"
NO_SYSTEMD="${NO_SYSTEMD:-0}"

log() { printf '[setup-runner] %s\n' "$*"; }
die() { printf '[setup-runner] FATAL: %s\n' "$*" >&2; exit 1; }

[ -n "${RUNNER_TOKEN:-}" ] || die "RUNNER_TOKEN not set — see header for where to grab one"
command -v curl >/dev/null || die "curl not installed"
command -v tar  >/dev/null || die "tar not installed"

if [ -d "$RUNNER_DIR/.runner" ]; then
  log "runner already configured at $RUNNER_DIR — nothing to do"
  log "to re-register, run: cd $RUNNER_DIR && ./config.sh remove --token <REMOVAL_TOKEN>"
  exit 0
fi

log "installing runner v${RUNNER_VERSION} into $RUNNER_DIR"
mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

tarball="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
curl -fsSL -o "$tarball" \
  "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${tarball}"

if [ -n "$RUNNER_TARBALL_SHA256" ]; then
  echo "${RUNNER_TARBALL_SHA256}  ${tarball}" | sha256sum -c -
fi

tar xzf "$tarball"
rm -f "$tarball"

log "registering with $REPO_URL"
./config.sh \
  --url "$REPO_URL" \
  --token "$RUNNER_TOKEN" \
  --name "$RUNNER_NAME" \
  --labels "self-hosted,linux,x64,$RUNNER_LABEL" \
  --work _work \
  --unattended \
  --replace

if [ "$NO_SYSTEMD" = "1" ]; then
  log "skipping systemd install (NO_SYSTEMD=1). Run manually with:"
  log "  cd $RUNNER_DIR && ./run.sh"
  exit 0
fi

log "installing systemd service (needs sudo)"
sudo ./svc.sh install pluggedin
sudo ./svc.sh start

# Docker access. setup-buildx-action talks to /var/run/docker.sock, which is
# root-owned and 660 with group=docker. The runner user must be in that
# group or every build fails with
#   permission denied while trying to connect to the docker API
# We add membership idempotently. The group change only takes effect after
# the runner service restarts (existing session inherits the old supps), so
# we cycle the service too.
if ! id -nG "$(whoami)" | tr ' ' '\n' | grep -qx docker; then
  log "adding $(whoami) to the docker group (needs sudo)"
  sudo usermod -aG docker "$(whoami)"
  log "restarting runner service to pick up new group membership"
  sudo systemctl restart "actions.runner.$(basename "$REPO_URL" | sed 's/\./-/g').$(hostname -s).service" || \
    sudo systemctl restart "actions.runner.VeriTeknik-pluggedin-app.$(hostname -s).service"
fi

log "done. Verify with:"
log "  systemctl status actions.runner.VeriTeknik-pluggedin-app.${RUNNER_NAME}.service"
log "  curl -s ${REPO_URL%/}/settings/actions/runners  # should list ${RUNNER_NAME}"

cat <<EOF

Next:
  1. Edit .github/workflows/build-image.yml and switch the build job to:

       runs-on: [self-hosted, linux, x64, ${RUNNER_LABEL}]

     and remove the workflow_dispatch / tag-only \`if:\` guard.

  2. Trigger a build with: gh workflow run build-image.yml --ref <branch>

  3. The runner is a regular linux process. Keep an eye on
     /home/pluggedin/actions-runner/_diag/ for its logs.
EOF
