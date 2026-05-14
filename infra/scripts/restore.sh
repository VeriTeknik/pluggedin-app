#!/usr/bin/env bash
# Restore a backup produced by infra/scripts/backup.sh.
#
# This is destructive. By default it refuses to run against a stack with
# data already present; pass --force to override.
#
# Usage:
#   infra/scripts/restore.sh /var/backups/pluggedin/20260514T030000Z.tar.age
#   infra/scripts/restore.sh ./bundle.tar.age --force
#   infra/scripts/restore.sh --pg-only ./bundle.tar.age   # skip zvec/uploads
#
# Requirements:
#   - SOPS_AGE_KEY_FILE pointing at the age private key.
#   - Stack already up (postgres healthy). We restore *into* the running PG.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA_DIR="${REPO_ROOT}/infra"
COMPOSE=(docker compose -f "${INFRA_DIR}/docker-compose.yml")

ARCHIVE=""
FORCE=0
PG_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --force)   FORCE=1; shift ;;
    --pg-only) PG_ONLY=1; shift ;;
    -h|--help) sed -n '2,14p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *)         ARCHIVE="$1"; shift ;;
  esac
done

[ -n "$ARCHIVE" ] || { echo "restore.sh: archive path required" >&2; exit 2; }
[ -r "$ARCHIVE" ] || { echo "restore.sh: $ARCHIVE not readable" >&2; exit 2; }
[ -n "${SOPS_AGE_KEY_FILE:-}" ] || export SOPS_AGE_KEY_FILE=/etc/sops/age/keys.txt
[ -r "$SOPS_AGE_KEY_FILE" ] || { echo "missing age key at $SOPS_AGE_KEY_FILE" >&2; exit 1; }

WORK="$(mktemp -d -t pluggedin-restore.XXXX)"
trap 'rm -rf "$WORK"' EXIT

echo "[restore] decrypting"
age --decrypt --identity "$SOPS_AGE_KEY_FILE" "$ARCHIVE" \
  | tar --extract --directory "$WORK"

cat "${WORK}/manifest.txt"

if [ "$FORCE" -ne 1 ]; then
  EXISTING=$("${COMPOSE[@]}" exec -T postgres \
    psql -U "${POSTGRES_USER:-pluggedin}" -d "${POSTGRES_DB:-v220_prod}" \
    -tA -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'")
  if [ "${EXISTING:-0}" -gt 1 ]; then
    echo "[restore] target DB already has ${EXISTING} tables in public schema." >&2
    echo "[restore] refusing without --force." >&2
    exit 1
  fi
fi

echo "[restore] pg_restore"
"${COMPOSE[@]}" exec -T postgres \
  pg_restore --clean --if-exists --no-owner --no-acl \
    -U "${POSTGRES_USER:-pluggedin}" -d "${POSTGRES_DB:-v220_prod}" \
  < "${WORK}/postgres.dump"

if [ "$PG_ONLY" -eq 1 ]; then
  echo "[restore] pg-only mode, done."
  exit 0
fi

echo "[restore] zvec-data → /home/pluggedin/zvec-data"
"${COMPOSE[@]}" stop pluggedin-app pluggedin-rc1 ofelia
rm -rf /home/pluggedin/zvec-data/*
tar --extract --file "${WORK}/zvec-data.tar" --directory /home/pluggedin
"${COMPOSE[@]}" start pluggedin-app pluggedin-rc1 ofelia

echo "[restore] uploads → /home/pluggedin/uploads"
tar --extract --file "${WORK}/uploads.tar" --directory /home/pluggedin --keep-newer-files

echo "[restore] verifying"
"${INFRA_DIR}/scripts/verify.sh"

echo "[restore] ok"
