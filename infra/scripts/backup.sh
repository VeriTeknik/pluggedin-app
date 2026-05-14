#!/usr/bin/env bash
# Take a consistent backup of the running stack: Postgres dump + zvec-data
# rsync + uploads rsync, packed into a single age-encrypted tarball.
#
# Usage:
#   infra/scripts/backup.sh                          # → /var/backups/pluggedin/<ts>.tar.age
#   infra/scripts/backup.sh --dest s3://my-bucket    # also upload (requires aws-cli)
#   BACKUP_DIR=/srv/backups infra/scripts/backup.sh
#
# Retention is not handled here; pair with a `find ... -mtime +30 -delete`
# or s3 lifecycle policy.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA_DIR="${REPO_ROOT}/infra"
COMPOSE=(docker compose -f "${INFRA_DIR}/docker-compose.yml")

BACKUP_DIR="${BACKUP_DIR:-/var/backups/pluggedin}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
DEST=""
RECIPIENTS_FILE="${BACKUP_RECIPIENTS_FILE:-/etc/sops/age/recipients.txt}"

for arg in "$@"; do
  case "$arg" in
    --dest=*) DEST="${arg#--dest=}" ;;
    --dest)   DEST="$2"; shift ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) ;;
  esac
done

command -v age >/dev/null || { echo "age not installed" >&2; exit 1; }
[ -r "$RECIPIENTS_FILE" ] || { echo "missing recipients file $RECIPIENTS_FILE" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
WORK="$(mktemp -d -t pluggedin-backup.XXXX)"
trap 'rm -rf "$WORK"' EXIT

echo "[backup] postgres → ${WORK}/postgres.dump"
"${COMPOSE[@]}" exec -T postgres \
  pg_dump -Fc -U "${POSTGRES_USER:-pluggedin}" -d "${POSTGRES_DB:-v220_prod}" \
  > "${WORK}/postgres.dump"

echo "[backup] zvec-data → ${WORK}/zvec-data.tar"
tar --create --file "${WORK}/zvec-data.tar" \
    --directory /home/pluggedin zvec-data

echo "[backup] uploads → ${WORK}/uploads.tar"
tar --create --file "${WORK}/uploads.tar" \
    --directory /home/pluggedin uploads

echo "[backup] manifest"
cat > "${WORK}/manifest.txt" <<EOF
backup_timestamp=$TS
host=$(hostname)
image=$("${COMPOSE[@]}" config --format json | jq -r '.services."pluggedin-app".image')
pg_size=$(du -b "${WORK}/postgres.dump" | cut -f1)
zvec_size=$(du -b "${WORK}/zvec-data.tar" | cut -f1)
uploads_size=$(du -b "${WORK}/uploads.tar" | cut -f1)
EOF

OUT="${BACKUP_DIR}/${TS}.tar.age"
echo "[backup] encrypting → $OUT"
tar --create --directory "$WORK" . \
  | age --encrypt --armor --recipients-file "$RECIPIENTS_FILE" \
  > "$OUT"

echo "[backup] size: $(du -h "$OUT" | cut -f1)"

if [ -n "$DEST" ]; then
  echo "[backup] uploading to $DEST"
  case "$DEST" in
    s3://*) aws s3 cp "$OUT" "$DEST/" ;;
    *) cp "$OUT" "$DEST/" ;;
  esac
fi

echo "[backup] ok: $OUT"
