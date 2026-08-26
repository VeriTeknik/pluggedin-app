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
# /run/sops is the production location: /run is tmpfs, so the decrypted
# secrets never touch disk. Creating it needs root, which is correct for a
# real deploy. Phases 2-4 run the stack alongside the native system as an
# unprivileged operator, so allow an override — it must still be a tmpfs
# path, and docker-compose.yml's bind mount has to be pointed at it too
# (see COMPOSE_FILE override below).
RUNTIME_DIR="${SOPS_RUNTIME_DIR:-/run/sops}"
SECRETS_ENCRYPTED="${INFRA_DIR}/sops/secrets.env.sops"
SECRETS_DECRYPTED="${RUNTIME_DIR}/secrets.env"
COMPOSE_FILE="${COMPOSE_FILE:-${INFRA_DIR}/docker-compose.yml}"

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
# The decrypted secrets outlive this script: containers mount the file for
# the lifetime of the stack, so it must NOT be shredded on exit. It lives on
# tmpfs and is mode 0400.

# 3. Decrypt.
#    --input-type/--output-type are mandatory here: sops infers format from
#    the file extension, and `.sops` is not a format it knows, so it falls
#    back to JSON and dies on the first `#` comment in the dotenv payload.
#    The 0400 below means a *second* deploy cannot redirect into this path -
#    not even as its owner - so make it writable first. `chmod`, not `rm`:
#    these files are bind-mounted into pluggedin-app, postgres and traefik,
#    and replacing the inode would leave those mounts pointing at a deleted
#    file until every container is recreated.
log "decrypting secrets"
chmod u+w "$SECRETS_DECRYPTED" 2>/dev/null || true
sops --decrypt --input-type dotenv --output-type dotenv \
  "$SECRETS_ENCRYPTED" > "$SECRETS_DECRYPTED"
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
  # Same reason as the secrets file above: 0400 from the previous run would
  # otherwise make this redirect fail.
  chmod u+w "$dest" 2>/dev/null || true
  printf '%s' "$value" > "$dest"
  chmod 0400 "$dest"
}

extract_secret TRAEFIK_DASHBOARD_AUTH traefik-users
# Postgres reads POSTGRES_PASSWORD_FILE instead of an environment variable,
# so the password never appears in Config.Env.
extract_secret POSTGRES_PASSWORD pg-password
# traefik/dynamic/middlewares.yml references this file directly via
# `usersFile:`. No rewriting of committed files at deploy time. Traefik's
# TLS issuance uses HTTP-01, so no DNS-provider token needs extracting.

# NOTE: there is deliberately no `$`-escaping step here any more.
#     While services used `env_file:`, Compose interpolated the file and
#     truncated any value at its first `$`, so deploy.sh doubled them. No
#     service uses env_file now — the app parses the mounted file with dotenv
#     and Postgres reads a *_FILE — and neither interpolates. Re-introducing
#     the escaping would hand both of them literal `$$`.

# 3c. Stage Traefik's dynamic config into tmpfs, out of reach of git.
#     Traefik watches this directory and reloads on any change. When it was
#     bind-mounted from the working tree, `git pull` — which the documented
#     deploy runs immediately before this script — could be observed
#     mid-write: Traefik loaded a file missing a middleware, every router
#     referencing it errored, and the site 404'd until the next reload.
#
#     Copy to a temp name then rename. rename(2) within a directory is
#     atomic, so the watcher only ever sees a complete file; without it we
#     would just move the same race here.
log "staging traefik dynamic config"
TRAEFIK_DYNAMIC_DIR="${RUNTIME_DIR}/traefik-dynamic"
mkdir -p "$TRAEFIK_DYNAMIC_DIR"
chmod 0755 "$TRAEFIK_DYNAMIC_DIR"
staged=0
for src in "${INFRA_DIR}"/traefik/dynamic/*.yml; do
  [ -f "$src" ] || continue
  base="$(basename "$src")"
  cp "$src" "${TRAEFIK_DYNAMIC_DIR}/.${base}.tmp"
  chmod 0444 "${TRAEFIK_DYNAMIC_DIR}/.${base}.tmp"
  mv -f "${TRAEFIK_DYNAMIC_DIR}/.${base}.tmp" "${TRAEFIK_DYNAMIC_DIR}/${base}"
  staged=$((staged + 1))
done
[ "$staged" -gt 0 ] || die "no dynamic config staged — Traefik would start with no middlewares"
log "staged ${staged} dynamic config file(s)"

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
