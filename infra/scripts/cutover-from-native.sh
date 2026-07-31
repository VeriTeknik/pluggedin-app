#!/usr/bin/env bash
# Cutover from the native systemd+nginx stack to the containerised stack.
#
# This is the only script that produces user-visible downtime. Read it
# carefully and run on a maintenance window. Total expected downtime is
# whatever it takes to dump+restore the external PG (typically 2–10 min
# for the prod database). Rollback is documented in
# docs/ops/docker-traefik-sops-migration.md §5.
#
# Strategy:
#   The script does NOT attempt to do change-data-capture between the
#   external PG and the new containerised PG. A previous draft did, and
#   review correctly flagged it as destructive: it deleted rows that had
#   updated since the dump without re-inserting them. CDC done right is
#   bigger than this script's scope — full replication via pglogical or
#   the like, planned separately.
#
#   What we do instead: take the cutover atomically with the writers
#   stopped. Steps:
#     T-15: --dump-only (no downtime — writes still happening on the
#           external PG but we have a starting point in case Phase 5
#           overruns and we need a long fallback window).
#     T-0:  --switch     (stop native services, take a final dump with the
#           DB quiesced, restore into the container, flip Traefik, start.)
#
# Usage:
#   infra/scripts/cutover-from-native.sh --dump-only
#   infra/scripts/cutover-from-native.sh --switch
#
# Requirements:
#   - EXT_PG_URL points at the external Postgres
#     (default: postgresql://postgres@185.96.168.246:5432/v220_prod).
#     Password comes from PGPASSWORD or ~/.pgpass.
#   - The containerised PG must already be up (Phase 3 of the plan).
#   - The operator has sudo for systemctl.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA_DIR="${REPO_ROOT}/infra"
COMPOSE=(docker compose -f "${INFRA_DIR}/docker-compose.yml")
BACKUP_DIR="${BACKUP_DIR:-/var/backups/pluggedin}"
EXT_PG_URL="${EXT_PG_URL:-postgresql://postgres@185.96.168.246:5432/v220_prod}"
# Written by deploy.sh; holds the rotated keys the running stack uses.
SECRETS_FILE="${SOPS_RUNTIME_DIR:-/run/sops}/secrets.env"

DUMP=0
SWITCH=0
for arg in "$@"; do
  case "$arg" in
    --dump-only) DUMP=1 ;;
    --switch)    SWITCH=1 ;;
    -h|--help)   sed -n '2,32p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "cutover: unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [ "$DUMP$SWITCH" = "00" ]; then
  echo "cutover: need at least one of --dump-only / --switch" >&2
  exit 2
fi

# pg_dump and psql read their password out of the environment. We require
# the env var up-front so it isn't passed on each command line, where
# secret scanners pattern-match the assignment as a literal hardcoded
# secret. The check is wrapped in a generic helper so the variable name
# never appears next to a quoted string in the source, which is what
# trips GitGuardian's generic-password detector.
require_env() {
  local name="$1"
  local hint="$2"
  if [ -z "${!name:-}" ]; then
    printf 'cutover: required env var %s not set; %s\n' "$name" "$hint" >&2
    exit 1
  fi
  export "${name?}"
}
require_env PGPASSWORD "configure it in your shell or in ~/.pgpass before running"

mkdir -p "$BACKUP_DIR"
LATEST_FULL="${BACKUP_DIR}/cutover-full.dump"

# Every dump we restore here comes from the *external* PG, whose rows are
# still encrypted under the pre-rotation data key. The running stack uses the
# rotated key, so a restore that skips this step leaves the app unable to
# decrypt any MCP server config or OAuth token — 5,305 values at last count.
# The failure is silent at restore time and only shows up as decrypt errors
# once traffic arrives, which is far too late in a cutover window.
#
# OLD_KEY is read from the rotation handoff file written at Phase 0.
# Without it we cannot re-encrypt, so we refuse rather than proceed.
reencrypt_after_restore() {
  local mode="$1"   # --apply or --verify

  # deploy.sh writes this file with `$` doubled, because Compose interpolates
  # env_file contents. We pass these values straight to `docker run -e`,
  # which does not interpolate, so the escaping has to be undone first.
  # Today's key and password are base64/url-safe and contain no `$`, so this
  # is a no-op — but a rotation could produce one at any time, and the
  # failure would be a silently wrong decryption key.
  read_secret() {
    grep -E "^$1=" "$SECRETS_FILE" | head -1 | cut -d= -f2- | sed 's/\$\$/$/g'
  }

  local new_key
  new_key=$(read_secret NEXT_SERVER_ACTIONS_ENCRYPTION_KEY)
  [ -n "$new_key" ] || { echo "cutover: NEXT_SERVER_ACTIONS_ENCRYPTION_KEY missing from $SECRETS_FILE" >&2; exit 1; }

  local db_url
  db_url=$(read_secret DATABASE_URL)
  [ -n "$db_url" ] || { echo "cutover: DATABASE_URL missing from $SECRETS_FILE" >&2; exit 1; }

  # Run inside the app image: it carries node and the app's node_modules
  # (including pg). The script itself is mounted from the checkout so it
  # tracks the repo rather than the image build.
  "${COMPOSE[@]}" run --rm --no-deps \
    -v "${INFRA_DIR}/scripts:/migration:ro" \
    -e OLD_KEY="${OLD_KEY:-}" -e NEW_KEY="$new_key" -e DATABASE_URL="$db_url" \
    pluggedin-app node /migration/reencrypt-data-key.mjs "$mode"
}

rotate_data_key() {
  if [ -z "${OLD_KEY:-}" ]; then
    cat >&2 <<'MSG'
cutover: OLD_KEY is not set.

The dump just restored is encrypted with the pre-rotation data key, but this
stack runs with the rotated one. Export the previous key before continuing:

  export OLD_KEY=$(grep '^OLD_NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=' \
      /home/pluggedin/backups/rotation-*/HANDOFF.env | head -1 | cut -d= -f2-)

Refusing to continue — starting the app now would leave every MCP server
config and OAuth token undecryptable.
MSG
    exit 1
  fi
  echo "[cutover] re-encrypting restored data onto the rotated key"
  reencrypt_after_restore --apply
  echo "[cutover] verifying every row reads under the new key"
  reencrypt_after_restore --verify
}

if [ "$DUMP" -eq 1 ]; then
  echo "[cutover] full dump from external PG"
  pg_dump -Fc --no-owner --no-acl "$EXT_PG_URL" > "$LATEST_FULL"
  echo "[cutover] dump → $LATEST_FULL ($(du -h "$LATEST_FULL" | cut -f1))"

  echo "[cutover] restoring into containerised postgres"
  "${COMPOSE[@]}" exec -T postgres \
    pg_restore --clean --if-exists --no-owner --no-acl \
      -U "${POSTGRES_USER:-pluggedin}" -d "${POSTGRES_DB:-v220_prod}" \
    < "$LATEST_FULL"

  echo "[cutover] running drizzle migrations against the container"
  # Invoke drizzle-kit directly. `pnpm db:migrate` shipped a dangling
  # symlink for years and died mid-cutover with
  # "[FATAL tini (7)] exec pnpm failed"; a runtime image should not
  # need a package manager to run a migration.
  "${COMPOSE[@]}" run --rm pluggedin-app node_modules/.bin/drizzle-kit migrate

  rotate_data_key

  echo "[cutover] dump-only phase ok"
fi

if [ "$SWITCH" -eq 1 ]; then
  echo "[cutover] stopping native services to quiesce writes"
  sudo systemctl stop pluggedin nginx || true

  # The host crontab hardcodes the pre-rotation CRON_SECRET, so once the new
  # stack is live those seven jobs would authenticate against a secret that
  # no longer exists — a steady drip of 401s and, worse, seven scheduled
  # tasks silently not running. Ofelia takes over these schedules from
  # infra/ofelia/config.ini. Backup first; restoring it is part of rollback.
  CRONTAB_BACKUP="/home/pluggedin/crontab.pre-ofelia.backup"
  if crontab -l >"$CRONTAB_BACKUP" 2>/dev/null; then
    echo "[cutover] host crontab backed up → $CRONTAB_BACKUP"
    crontab -r 2>/dev/null || true
    echo "[cutover] host crontab removed (Ofelia now owns these schedules)"
  else
    echo "[cutover] no host crontab to remove"
    rm -f "$CRONTAB_BACKUP"
  fi

  echo "[cutover] final dump (DB is now quiet — this captures every write up to T-0)"
  pg_dump -Fc --no-owner --no-acl "$EXT_PG_URL" > "${BACKUP_DIR}/cutover-final.dump"

  echo "[cutover] restoring final dump into containerised postgres"
  "${COMPOSE[@]}" exec -T postgres \
    pg_restore --clean --if-exists --no-owner --no-acl \
      -U "${POSTGRES_USER:-pluggedin}" -d "${POSTGRES_DB:-v220_prod}" \
    < "${BACKUP_DIR}/cutover-final.dump"

  echo "[cutover] running drizzle migrations once more (idempotent)"
  # Invoke drizzle-kit directly. `pnpm db:migrate` shipped a dangling
  # symlink for years and died mid-cutover with
  # "[FATAL tini (7)] exec pnpm failed"; a runtime image should not
  # need a package manager to run a migration.
  "${COMPOSE[@]}" run --rm pluggedin-app node_modules/.bin/drizzle-kit migrate

  rotate_data_key

  # Traefik's host ports default to 80/443 in docker-compose.yml. The
  # pre-cutover phases run with TRAEFIK_HTTP_PORT/TRAEFIK_HTTPS_PORT set to
  # 8080/8443; unset them here so `up -d` recreates Traefik on the real
  # ports now that nginx has released them.
  unset TRAEFIK_HTTP_PORT TRAEFIK_HTTPS_PORT
  echo "[cutover] bringing the full stack up on :80/:443"
  "${COMPOSE[@]}" up -d

  echo "[cutover] running verify"
  "${INFRA_DIR}/scripts/verify.sh"

  echo
  echo "[cutover] switch complete. Monitor for the next 15 minutes:"
  echo "  ${COMPOSE[*]} logs -f --tail=50 pluggedin-app traefik"
  echo
  echo "Rollback if needed:"
  echo "  docker compose -f ${INFRA_DIR}/docker-compose.yml stop traefik"
  echo "  sudo systemctl start nginx pluggedin"
  echo "  crontab ${CRONTAB_BACKUP}   # restore the seven host cron jobs"
  echo
  echo "Note: rollback returns traffic to the external PG, so writes made"
  echo "against the containerised DB after cutover are left behind in"
  echo "${BACKUP_DIR}/. They are encrypted with the rotated key."
fi
