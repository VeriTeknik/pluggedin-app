#!/usr/bin/env bash
# Pull-based automatic deployment.
#
# Runs on the production host as `pluggedin` under a systemd timer. Compares
# origin/main against the running container's revision label and deploys when
# they differ — subject to the infra gate (see gate_blocked_files).
#
# WHY POLLING RATHER THAN CI: infra/scripts/isolate-gha-runner.sh deliberately
# moved the Actions runner onto a rootless daemon as a separate user with no
# access to /etc/sops/age/keys.txt, /run/sops/secrets.env, or the production
# Docker socket. deploy.sh needs all three. A push-based deploy would mean
# handing those back. See docs/superpowers/specs/2026-08-10-auto-deploy-design.md.
#
# Usage:
#   deploy-watch.sh              # one poll cycle (what the timer runs)
#   deploy-watch.sh --status     # report state, change nothing
#   deploy-watch.sh --dry-run    # report what it would deploy, change nothing
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_TREE="${DEPLOY_TREE:-/home/pluggedin/deploy-tree}"
STATE_DIR="${STATE_DIR:-/var/lib/pluggedin-deploy-watch}"
IMAGE_REPO="${IMAGE_REPO:-ghcr.io/veriteknik/pluggedin-app}"
APP_CONTAINER="${APP_CONTAINER:-pluggedin-app}"
SITE_URL="${SITE_URL:-https://plugged.in}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_TREE}/infra/docker-compose.yml}"

log()  { printf '[deploy-watch %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die()  { printf '[deploy-watch] FATAL: %s\n' "$*" >&2; exit 1; }
now()  { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Resolver for lock file path, respecting STATE_DIR overrides after sourcing.
lock_file() {
  printf '%s/deploy-watch.lock' "${STATE_DIR}"
}

# --- state -----------------------------------------------------------------
# Flat key=value. Values are single-line and script-controlled, so no quoting
# rules are needed; state_set rewrites via mktemp + rename, never in place.
state_set() {
  local key="$1" value="$2" tmp
  local STATE_FILE="${STATE_DIR}/deploy-watch.state"
  mkdir -p "$STATE_DIR"
  touch "$STATE_FILE"
  tmp="$(mktemp "${STATE_FILE}.XXXXXX")"
  { grep -v "^${key}=" "$STATE_FILE" || true; printf '%s=%s\n' "$key" "$value"; } > "$tmp"
  mv -f "$tmp" "$STATE_FILE"
}

state_get() {
  local key="$1"
  local STATE_FILE="${STATE_DIR}/deploy-watch.state"
  [ -f "$STATE_FILE" ] || { printf ''; return 0; }
  sed -n "s/^${key}=//p" "$STATE_FILE" | tail -1
}

cmd_status() {
  printf 'deploy-watch status\n'
  printf '  last check      : %s\n' "$(state_get last_check)"
  printf '  running revision: %s\n' "$(state_get running_rev)"
  printf '  latest revision : %s\n' "$(state_get latest_rev)"
  printf '  last outcome    : %s\n' "$(state_get last_outcome)"
  local blocked
  blocked="$(state_get blocked_rev)"
  if [ -n "$blocked" ]; then
    printf '\n  BLOCKED by the infra gate: %s\n' "$blocked"
    printf '  files: %s\n' "$(state_get blocked_files)"
    printf '  This will not deploy automatically. Deploy it by hand:\n'
    printf '    IMAGE_TAG=sha-%s infra/scripts/deploy.sh\n' "$(state_get blocked_short)"
  fi
}

# --- revision and image resolution -----------------------------------------
running_revision() {
  # Empty (not an error) when the container does not exist: a first install
  # is a legitimate state, and the caller decides what to do about it.
  docker inspect "$APP_CONTAINER" \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
    2>/dev/null || printf ''
}

short_sha() { git -C "$DEPLOY_TREE" rev-parse --short=7 "$1"; }

image_exists() {
  # `docker manifest inspect` negotiates anonymous auth itself, which is what
  # we want: the host is logged out of ghcr.io and the package is public.
  # Same call infra/scripts/prune-build-artifacts.sh uses.
  docker manifest inspect "${IMAGE_REPO}:$1" >/dev/null 2>&1
}

fetch_tree() {
  [ -d "${DEPLOY_TREE}/.git" ] || die "deploy tree missing at ${DEPLOY_TREE} (see docs/ops/auto-deploy.md)"
  git -C "$DEPLOY_TREE" fetch --quiet origin main
  git -C "$DEPLOY_TREE" rev-parse origin/main
}

main() {
  case "${1:-}" in
    --status)  cmd_status; return 0 ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \?//'; return 0 ;;
  esac
  die "not implemented yet"
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
