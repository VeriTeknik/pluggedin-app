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

# Held for the whole deploy so the retention job cannot prune underneath it —
# see the same lock in infra/scripts/prune-build-artifacts.sh. Deploys wait
# rather than skip: the prune is short, and a deploy the operator asked for
# should happen.
# Overridable so the locking itself can be exercised without root or a real
# deploy; production uses the default.
LOCK_FILE="${PLUGGEDIN_LOCK_FILE:-/var/lock/pluggedin-deploy.lock}"
if exec 9>"$LOCK_FILE" 2>/dev/null && command -v flock >/dev/null 2>&1; then
  flock -w 600 9 || { echo "could not acquire ${LOCK_FILE} within 600s" >&2; exit 1; }
fi

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

# Secret files are written through a temp file and their mode is relaxed only
# for the copy. This trap is the backstop: whatever happens - a failed decrypt,
# a full tmpfs, a Ctrl-C between the chmod and the write - temps go away and
# every file we touched ends up back at 0400.
TMP_FILES=()
SECRET_FILES=()
KEEP_TMP=0
cleanup() {
  if [ "$KEEP_TMP" = "0" ] && [ ${#TMP_FILES[@]} -gt 0 ]; then
    rm -f "${TMP_FILES[@]}" 2>/dev/null || true
  fi
  if [ ${#SECRET_FILES[@]} -gt 0 ]; then chmod 0400 "${SECRET_FILES[@]}" 2>/dev/null || true; fi
}
trap cleanup EXIT

# Copy $1's contents into $2 without replacing $2's inode: these files are
# bind-mounted into pluggedin-app, postgres and traefik, and a new inode would
# leave the running mounts pointing at a deleted file. The previous run left $2
# at 0400 - not writable even by its owner - so the mode has to come off first.
install_secret_file() {
  local src="$1" dest="$2"
  SECRET_FILES+=("$dest")
  chmod u+w "$dest" 2>/dev/null || true
  # `|| copy_status=$?` is load-bearing: under `set -e` a failing cat would
  # otherwise exit here, before KEEP_TMP is set, and the trap would delete the
  # very temp file this is meant to preserve.
  local copy_status=0
  cat "$src" > "$dest" || copy_status=$?
  # A file's *contents* cannot be replaced atomically - only its name can, via
  # rename - and rename is out here because the inode is bind-mounted into
  # running containers. The write window therefore cannot be removed, only made
  # detectable: if the copy failed or came up short (a full tmpfs being the
  # realistic cause) fail loudly and keep the good copy for recovery, rather
  # than leaving a truncated secret for the next container start to read.
  if [ "$copy_status" != "0" ] || [ "$(wc -c < "$src")" != "$(wc -c < "$dest")" ]; then
    KEEP_TMP=1
    die "failed to write ${dest} (copy exit ${copy_status}) - intact copy kept at ${src}"
  fi
  chmod 0400 "$dest"
}

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
#    Decrypt into a temp file rather than straight into the mounted path. `>`
#    truncates before sops runs, so decrypting in place would empty the stack's
#    live secrets file on any sops failure - a wrong age key would take the
#    secrets with it. On success install_secret_file copies it into place.
log "decrypting secrets"
secrets_tmp="$(mktemp "${RUNTIME_DIR}/.secrets.env.XXXXXX")"
TMP_FILES+=("$secrets_tmp")
sops --decrypt --input-type dotenv --output-type dotenv \
  "$SECRETS_ENCRYPTED" > "$secrets_tmp"
install_secret_file "$secrets_tmp" "$SECRETS_DECRYPTED"

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
  # Same temp-then-install dance as the secrets file above.
  local tmp
  tmp="$(mktemp "${RUNTIME_DIR}/.$(basename "$dest").XXXXXX")"
  TMP_FILES+=("$tmp")
  printf '%s' "$value" > "$tmp"
  install_secret_file "$tmp" "$dest"
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
