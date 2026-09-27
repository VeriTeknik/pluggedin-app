#!/usr/bin/env bash
# Deploy entry point. Decrypt → pull → up → recreate stale secret consumers → smoke.
#
# Usage:
#   infra/scripts/deploy.sh                 # deploy the tag in IMAGE_TAG (or :latest)
#   IMAGE_TAG=sha-abc123 infra/scripts/deploy.sh
#   infra/scripts/deploy.sh --no-pull       # use whatever image is already local
#
# Assumes:
#   - sops (>=3.8) and age (>=1.1) on PATH; GNU coreutils
#   - SOPS_AGE_KEY_FILE=/etc/sops/age/keys.txt (or another readable path)
#   - secrets.env.sops holds REDIS_PASSWORD (32+ chars of [A-Za-z0-9._~-])
#   - This script is invoked from anywhere; it cd's to the repo root.

set -euo pipefail

# Held for the whole deploy so the retention job cannot prune underneath it —
# see the same lock in infra/scripts/prune-build-artifacts.sh. Deploys wait
# rather than skip: the prune is short, and a deploy the operator asked for
# should happen.
# Overridable so the locking itself can be exercised without root or a real
# deploy; production uses the default.
LOCK_FILE="${PLUGGEDIN_LOCK_FILE:-/var/lock/pluggedin-deploy.lock}"
#
# The braces matter: `exec 9>"$FILE" 2>/dev/null` would redirect stderr for the
# whole deploy, silencing every error this script reports. Scoped to the exec.
if command -v flock >/dev/null 2>&1; then
  if { exec 9>"$LOCK_FILE"; } 2>/dev/null; then
    flock -w 600 9 || { echo "could not acquire ${LOCK_FILE} within 600s" >&2; exit 1; }
  else
    # A deploy is operator-initiated and watched, so this warns rather than
    # refusing. The retention job is the unattended one and treats the same
    # condition as a failed run.
    echo "WARNING: cannot open ${LOCK_FILE} — deploying WITHOUT retention-job serialisation" >&2
  fi
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
      sed -n '2,13p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *) echo "deploy.sh: unknown arg: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '[deploy %s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die() { printf '[deploy] FATAL: %s\n' "$*" >&2; exit 1; }

# Secret files are written through a temp file and their mode is relaxed only
# for the copy. This trap is the backstop: whatever happens - a failed decrypt,
# a full tmpfs, a Ctrl-C between the chmod and the write - temps go away and
# every file we touched ends up back at its final mode (0400 unless noted).
TMP_FILES=()
SECRET_FILES=()
SECRET_MODES=()
CHANGED_SECRETS=()
KEEP_TMP=0
cleanup() {
  if [ "$KEEP_TMP" = "0" ] && [ ${#TMP_FILES[@]} -gt 0 ]; then
    rm -f "${TMP_FILES[@]}" 2>/dev/null || true
  fi
  local i
  for i in "${!SECRET_FILES[@]}"; do
    chmod "${SECRET_MODES[$i]}" "${SECRET_FILES[$i]}" 2>/dev/null || true
  done
}
trap cleanup EXIT

# Copy $1's contents into $2 without replacing $2's inode: these files are
# bind-mounted into pluggedin-app, postgres, redis and traefik, and a new inode
# would leave the running mounts pointing at a deleted file. The previous run
# left $2 at its final mode (0400: not writable even by its owner), so the
# mode has to come off first. $3 is the final mode, default 0400.
#
# Identical content is NOT rewritten. That keeps each file's mtime meaning
# "when this secret last changed", which step 5a relies on to decide which
# containers are still running with an older value.
install_secret_file() {
  local src="$1" dest="$2" mode="${3:-0400}"
  SECRET_FILES+=("$dest")
  SECRET_MODES+=("$mode")
  if [ -f "$dest" ] && cmp -s "$src" "$dest"; then
    chmod "$mode" "$dest"
    return 0
  fi
  CHANGED_SECRETS+=("$dest")
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
  chmod "$mode" "$dest"
}

# 1. Preflight
command -v sops >/dev/null || die "sops not installed"
command -v age >/dev/null  || die "age not installed"
command -v docker >/dev/null || die "docker not installed"
command -v cmp >/dev/null || die "cmp not installed (diffutils)"
# Step 5a compares file mtimes with container start times at nanosecond
# resolution via GNU date (-d / -r / %N).
date -d @0 +%s%N >/dev/null 2>&1 || die "GNU date required"
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

# 3-redis. Redis requires a password (see the redis service and REDIS_URL note
#     in docker-compose.yml). Checked BEFORE anything is installed, so a
#     secrets file without it leaves the running stack exactly as it was.
#     The character set is URL-unreserved on purpose: the value is spliced
#     verbatim into both a redis:// URL and a redis.conf directive, and needs
#     no escaping in either.
REDIS_PASSWORD_VALUE="$(grep -E '^REDIS_PASSWORD=' "$secrets_tmp" | head -1 | cut -d= -f2- | sed -E "s/^[\"']//; s/[\"']\$//" || true)"
if ! [[ "$REDIS_PASSWORD_VALUE" =~ ^[A-Za-z0-9._~-]{32,}$ ]]; then
  die "REDIS_PASSWORD missing or invalid in ${SECRETS_ENCRYPTED}: it must be 32+ characters from [A-Za-z0-9._~-] (e.g. \`openssl rand -hex 32\`); add it with \`sops ${SECRETS_ENCRYPTED}\`. Nothing has been changed."
fi
# The app's REDIS_URL is derived here, never hand-maintained: one password,
# two consumers, no way for them to disagree. Any REDIS_URL line already in
# the file is dropped. (mawk-safe: no POSIX character classes.)
secrets_final_tmp="$(mktemp "${RUNTIME_DIR}/.secrets.env.XXXXXX")"
TMP_FILES+=("$secrets_final_tmp")
awk '!/^[ \t]*(export[ \t]+)?REDIS_URL[ \t]*=/' "$secrets_tmp" > "$secrets_final_tmp"
printf '\n# Derived by infra/scripts/deploy.sh from REDIS_PASSWORD.\nREDIS_URL=redis://default:%s@redis:6379\n' \
  "$REDIS_PASSWORD_VALUE" >> "$secrets_final_tmp"
install_secret_file "$secrets_final_tmp" "$SECRETS_DECRYPTED"

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
pg_pw_file="${RUNTIME_DIR}/pg-password"
pg_pw_existed=0
if [ -f "$pg_pw_file" ]; then pg_pw_existed=1; fi
extract_secret POSTGRES_PASSWORD pg-password
# traefik/dynamic/middlewares.yml references this file directly via
# `usersFile:`. No rewriting of committed files at deploy time. Traefik's
# TLS issuance uses HTTP-01, so no DNS-provider token needs extracting.

# Redis reads `requirepass` from a config file (docker-compose.yml explains why
# not a flag). 0444, unlike every other file here: redis-server drops to its
# own uid (999) inside the container and could not read a 0400 file owned by
# the deploy account. The 0700 $RUNTIME_DIR still keeps other host accounts
# out, and the only other container that mounts this directory (Traefik) runs
# as root and could read any file in it whatever its mode.
redis_conf_tmp="$(mktemp "${RUNTIME_DIR}/.redis.conf.XXXXXX")"
TMP_FILES+=("$redis_conf_tmp")
printf 'requirepass %s\n' "$REDIS_PASSWORD_VALUE" > "$redis_conf_tmp"
install_secret_file "$redis_conf_tmp" "${RUNTIME_DIR}/redis.conf" 0444
unset REDIS_PASSWORD_VALUE

is_changed() {
  local f
  for f in "${CHANGED_SECRETS[@]}"; do [ "$f" = "$1" ] && return 0; done
  return 1
}
# Postgres only reads its password file when initialising an EMPTY data
# directory, so no restart can rotate it. Say so rather than let the app
# restart below fail on a DATABASE_URL the role no longer matches.
if [ "$pg_pw_existed" = 1 ] && is_changed "$pg_pw_file"; then
  log "WARN: POSTGRES_PASSWORD changed. This deploy does NOT change the database role's password -"
  log "WARN: run ALTER ROLE ... PASSWORD with the new value (keeping DATABASE_URL in step) as part of the rotation."
fi

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

# 5a. Secret rotation. `up -d` only recreates a container whose image or
#     compose config changed. New secret *contents* behind an unchanged bind
#     mount leave the old process running on the old values, so a rotated
#     NEXTAUTH_SECRET or CRON_SECRET kept working for whoever held it while the
#     deploy reported success. Every consumer reads its secrets once, at
#     start, so the rule is: it must have started after its secret files last
#     changed (install_secret_file only touches a file whose content changed).
#     Anything older is recreated, and the deploy fails unless every consumer
#     is then verifiably newer. Comparing against the file's mtime rather than
#     "did this run change it" also covers a previous deploy that installed new
#     secrets and then died before restarting anything.
if [ ${#CHANGED_SECRETS[@]} -gt 0 ]; then
  changed_names=()
  for f in "${CHANGED_SECRETS[@]}"; do changed_names+=("$(basename "$f")"); done
  log "secret files changed by this deploy: ${changed_names[*]}"
fi

file_mtime_ns() { if [ -e "$1" ]; then date -r "$1" +%s%N; else echo 0; fi; }
container_id() { docker compose -f "$COMPOSE_FILE" ps -a -q "$1" | head -1; }
started_ns() {
  # $1 = compose service. 0 when it has no container or never started.
  local cid started
  cid="$(container_id "$1")"
  if [ -z "$cid" ]; then echo 0; return; fi
  started="$(docker inspect -f '{{.State.StartedAt}}' "$cid")"
  case "$started" in
    ''|0001-*) echo 0 ;;
    *) date -d "$started" +%s%N ;;
  esac
}
wait_healthy() {
  local svc="$1" timeout="$2" waited=0 cid status
  cid="$(container_id "$svc")"
  [ -n "$cid" ] || die "${svc}: no container after recreate"
  while :; do
    # "running" can only come back for a service without a healthcheck.
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid")"
    case "$status" in healthy|running) return 0 ;; esac
    [ "$waited" -lt "$timeout" ] || die "${svc} not healthy ${timeout}s after recreate (status: ${status})"
    sleep 3
    waited=$((waited + 3))
  done
}
ensure_started_after() {
  # $1 = service, $2 = threshold in ns since the epoch, $3 = what it must postdate
  local svc="$1" threshold="$2" what="$3"
  if [ "$(started_ns "$svc")" -gt "$threshold" ]; then return 0; fi
  log "${svc}: running since before ${what} - recreating it so it drops the old values"
  docker compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate "$svc"
  wait_healthy "$svc" 240
  [ "$(started_ns "$svc")" -gt "$threshold" ] \
    || die "${svc} is still running with values older than ${what}"
  log "${svc}: now running with the current secrets"
}

# Order matters: Redis first, then the app, then Traefik.
ensure_started_after redis "$(file_mtime_ns "${RUNTIME_DIR}/redis.conf")" \
  "redis.conf last changed"
# The app's Redis clients stop reconnecting after a few attempts
# (retryStrategy in lib/rate-limiter*.ts) and production rate limiting then
# fails closed, so the app must also have started after Redis last did.
app_threshold="$(file_mtime_ns "$SECRETS_DECRYPTED")"
redis_started="$(started_ns redis)"
if [ "$redis_started" -gt "$app_threshold" ]; then app_threshold="$redis_started"; fi
ensure_started_after pluggedin-app "$app_threshold" \
  "secrets.env last changed or Redis last restarted"
# basicAuth reads usersFile when the middleware is built; the file provider
# does not watch it, and re-staging identical dynamic config is a no-op.
ensure_started_after traefik "$(file_mtime_ns "${RUNTIME_DIR}/traefik-users")" \
  "traefik-users last changed"
# Postgres is deliberately absent: see the POSTGRES_PASSWORD warning above.
# Ofelia needs nothing: each job reads CRON_SECRET from the app's mounted
# file at run time.

# 6. Smoke
log "running verify"
"$INFRA_DIR/scripts/verify.sh"

log "deploy ok"
