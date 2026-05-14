#!/usr/bin/env bash
# Deploy entry point. Decrypt → pull → up → smoke.
#
# Usage:
#   infra/scripts/deploy.sh                 # deploy the tag in IMAGE_TAG (or :latest)
#   IMAGE_TAG=sha-abc123 infra/scripts/deploy.sh
#   infra/scripts/deploy.sh --no-pull       # use whatever image is already local
#
# Assumes:
#   - sops (>=3.8) and age (>=1.1) on PATH
#   - SOPS_AGE_KEY_FILE=/etc/sops/age/keys.txt (or another readable path)
#   - This script is invoked from anywhere; it cd's to the repo root.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA_DIR="${REPO_ROOT}/infra"
RUNTIME_DIR="/run/sops"
SECRETS_ENCRYPTED="${INFRA_DIR}/sops/secrets.env.sops"
SECRETS_DECRYPTED="${RUNTIME_DIR}/secrets.env"
COMPOSE_FILE="${INFRA_DIR}/docker-compose.yml"

PULL=1
for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL=0 ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *) echo "deploy.sh: unknown arg: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '[deploy %s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die() { printf '[deploy] FATAL: %s\n' "$*" >&2; exit 1; }

# 1. Preflight
command -v sops >/dev/null || die "sops not installed"
command -v age >/dev/null  || die "age not installed"
command -v docker >/dev/null || die "docker not installed"
[ -r "$SECRETS_ENCRYPTED" ] || die "missing $SECRETS_ENCRYPTED"
[ -n "${SOPS_AGE_KEY_FILE:-}" ] || export SOPS_AGE_KEY_FILE=/etc/sops/age/keys.txt
[ -r "$SOPS_AGE_KEY_FILE" ] || die "age key not readable at $SOPS_AGE_KEY_FILE"

# 2. tmpfs for the decrypted secrets. /run is already tmpfs on systemd
#    systems; if /run/sops isn't mounted yet, create it. We don't `mount -t
#    tmpfs` because we want this to work in environments where the operator
#    isn't root for the deploy.
mkdir -p "$RUNTIME_DIR"
chmod 0700 "$RUNTIME_DIR"
trap 'shred -uf "$SECRETS_DECRYPTED" 2>/dev/null || rm -f "$SECRETS_DECRYPTED"' EXIT

# 3. Decrypt
log "decrypting secrets"
sops --decrypt "$SECRETS_ENCRYPTED" > "$SECRETS_DECRYPTED"
chmod 0400 "$SECRETS_DECRYPTED"

# 3a. Project specific secrets out of the env file into single-line files
#     under /run/sops/, because Traefik and a few other services consume
#     them via *_FILE indirection rather than via the env_file as a whole.
#     Each *_FILE consumer in docker-compose.yml needs one line here.
extract_secret() {
  # $1 = env key in secrets.env, $2 = output filename under $RUNTIME_DIR
  local key="$1" dest="${RUNTIME_DIR}/$2"
  # shellcheck disable=SC2002  # explicit cat keeps the awk pipeline simple
  local value
  value=$(grep -E "^${key}=" "$SECRETS_DECRYPTED" | head -1 | cut -d= -f2- | sed -E 's/^"//; s/"$//')
  if [ -z "$value" ]; then
    log "WARN: ${key} missing from secrets.env (skipping ${dest})"
    return
  fi
  printf '%s' "$value" > "$dest"
  chmod 0400 "$dest"
}

extract_secret CF_API_TOKEN          cloudflare_token
extract_secret TRAEFIK_DASHBOARD_AUTH traefik-users
# traefik/dynamic/middlewares.yml references these files directly via
# `usersFile:` and (for Traefik's static config) the CF_DNS_API_TOKEN_FILE
# env var. No rewriting of committed files at deploy time.

# 4. Pull image (skip with --no-pull)
if [ "$PULL" -eq 1 ]; then
  log "pulling images"
  docker compose -f "$COMPOSE_FILE" pull --ignore-buildable
fi

# 5. Up
log "starting stack"
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

# 6. Smoke
log "running verify"
"$INFRA_DIR/scripts/verify.sh"

log "deploy ok"
