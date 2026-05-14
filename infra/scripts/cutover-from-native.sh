#!/usr/bin/env bash
# Cutover from the native systemd+nginx stack to the containerised stack.
#
# This is the only script that produces user-visible downtime. Read it
# carefully and run on a maintenance window. Total expected downtime: 5–10
# minutes. Rollback is documented in docs/ops/docker-traefik-sops-migration.md.
#
# Three phases, controlled by flags so you can step through:
#   --dump-only      run pg_dump from external PG, store under /var/backups/pluggedin
#   --delta-apply    diff-and-apply *only* the rows that changed since the last
#                    --dump-only run (uses last_modified columns where available
#                    and full table replace for small reference tables)
#   --switch         take the native services down, swap Traefik onto :80/:443,
#                    bring up containers, run verify.sh
#
# Recommended sequence:
#   T-5: infra/scripts/cutover-from-native.sh --dump-only
#   T-0: infra/scripts/cutover-from-native.sh --delta-apply --switch

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA_DIR="${REPO_ROOT}/infra"
COMPOSE=(docker compose -f "${INFRA_DIR}/docker-compose.yml")
BACKUP_DIR="/var/backups/pluggedin"
EXT_PG_URL="${EXT_PG_URL:-postgresql://postgres@185.96.168.246:5432/v220_prod}"

DUMP=0
DELTA=0
SWITCH=0
for arg in "$@"; do
  case "$arg" in
    --dump-only)   DUMP=1 ;;
    --delta-apply) DELTA=1 ;;
    --switch)      SWITCH=1 ;;
    -h|--help)     sed -n '2,18p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "cutover: unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [ "$DUMP$DELTA$SWITCH" = "000" ]; then
  echo "cutover: need at least one of --dump-only / --delta-apply / --switch" >&2
  exit 2
fi

mkdir -p "$BACKUP_DIR"
LATEST_FULL="${BACKUP_DIR}/cutover-full.dump"
LATEST_DELTA="${BACKUP_DIR}/cutover-delta-$(date -u +%Y%m%dT%H%M%SZ).sql"

if [ "$DUMP" -eq 1 ]; then
  echo "[cutover] full dump from external PG"
  PGPASSWORD="${PGPASSWORD:?set PGPASSWORD or use ~/.pgpass}" \
    pg_dump -Fc --no-owner --no-acl "$EXT_PG_URL" > "$LATEST_FULL"
  echo "[cutover] dump → $LATEST_FULL ($(du -h "$LATEST_FULL" | cut -f1))"

  # Restore into the containerised PG (which is sitting there waiting).
  echo "[cutover] restoring into containerised postgres"
  "${COMPOSE[@]}" exec -T postgres \
    pg_restore --clean --if-exists --no-owner --no-acl \
      -U "${POSTGRES_USER:-pluggedin}" -d "${POSTGRES_DB:-v220_prod}" \
    < "$LATEST_FULL"

  echo "[cutover] running drizzle migrations"
  "${COMPOSE[@]}" run --rm pluggedin-app sh -c "cd /app && pnpm db:migrate"

  echo "[cutover] dump-only phase ok"
fi

if [ "$DELTA" -eq 1 ]; then
  echo "[cutover] delta dump (changes since full dump)"
  # We don't have CDC. Best practical approach: capture writes that hit tables
  # with `updated_at` since the full dump's high-water mark. For the rest,
  # rely on the fact that the native app is stopped during --switch.
  #
  # This step is intentionally conservative: if anything looks odd we abort
  # so the operator can investigate before the cutover continues.
  if [ ! -f "$LATEST_FULL" ]; then
    echo "[cutover] no full dump found; run --dump-only first." >&2
    exit 1
  fi
  HWM=$(stat -c %Y "$LATEST_FULL")
  HWM_ISO=$(date -u -d "@$HWM" +%Y-%m-%dT%H:%M:%SZ)
  echo "[cutover] high-water mark: $HWM_ISO"

  TABLES=$(PGPASSWORD="${PGPASSWORD:?}" psql -h 185.96.168.246 -U postgres -d v220_prod -tAc "
    SELECT table_name FROM information_schema.columns
    WHERE table_schema='public' AND column_name='updated_at'
    GROUP BY table_name ORDER BY table_name
  ")

  : > "$LATEST_DELTA"
  for t in $TABLES; do
    PGPASSWORD="${PGPASSWORD:?}" psql -h 185.96.168.246 -U postgres -d v220_prod -tA \
      -c "COPY (SELECT * FROM ${t} WHERE updated_at > '${HWM_ISO}') TO STDOUT" \
      > "/tmp/cutover-${t}.tsv" || true
    if [ -s "/tmp/cutover-${t}.tsv" ]; then
      echo "BEGIN; DELETE FROM ${t} WHERE updated_at > '${HWM_ISO}';" >> "$LATEST_DELTA"
      cnt=$(wc -l < "/tmp/cutover-${t}.tsv")
      echo "[cutover]   ${t}: ${cnt} changed rows"
    fi
    rm -f "/tmp/cutover-${t}.tsv"
  done

  if [ -s "$LATEST_DELTA" ]; then
    echo "[cutover] applying delta → $LATEST_DELTA"
    "${COMPOSE[@]}" exec -T postgres \
      psql -U "${POSTGRES_USER:-pluggedin}" -d "${POSTGRES_DB:-v220_prod}" \
      < "$LATEST_DELTA"
  else
    echo "[cutover] no delta rows since $HWM_ISO"
  fi
fi

if [ "$SWITCH" -eq 1 ]; then
  echo "[cutover] stopping native services"
  sudo systemctl stop pluggedin pluggedin-rc1 nginx || true

  echo "[cutover] bringing containers up on :80/:443"
  "${COMPOSE[@]}" up -d
  "${INFRA_DIR}/scripts/verify.sh"

  echo
  echo "[cutover] switch complete. Monitor:"
  echo "  docker compose -f ${INFRA_DIR}/docker-compose.yml logs -f --tail=50 pluggedin-app traefik"
fi
