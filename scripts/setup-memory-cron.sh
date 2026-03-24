#!/bin/bash
#
# setup-memory-cron.sh — Install cron jobs for memory system maintenance
#
# Three cron endpoints:
#   /api/memory/process  — every 15 min: classify fresh_memory → memory_ring via LLM
#   /api/memory/cbp      — daily 3am: promote memory_ring → gut_patterns (collective)
#   /api/memory/decay    — daily 4am: decay engine + cleanup forgotten/expired
#
# Prerequisites: CRON_SECRET and NEXTAUTH_URL must be set in APP_DIR/.env
# Run as the pluggedin service user (or any user with crontab access).
#
# Usage:
#   bash scripts/setup-memory-cron.sh
#   bash scripts/setup-memory-cron.sh --remove   # remove all memory cron jobs

set -euo pipefail

SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
APP_DIR="${APP_DIR:-/home/pluggedin/pluggedin-app}"
ENV_FILE="${APP_DIR}/.env"
LOG_DIR="${LOG_DIR:-/var/log/pluggedin}"
CRON_MARKER="pluggedin-memory-cron"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ── Load .env ────────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env file not found at $ENV_FILE"
  echo "Set APP_DIR to the application directory and try again."
  exit 1
fi

# Extract CRON_SECRET and NEXTAUTH_URL from .env (handles quoted and unquoted values)
CRON_SECRET=$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | sed 's/^CRON_SECRET=//; s/^["'"'"']//; s/["'"'"']$//' || true)
NEXTAUTH_URL=$(grep -E '^NEXTAUTH_URL=' "$ENV_FILE" | head -1 | sed 's/^NEXTAUTH_URL=//; s/^["'"'"']//; s/["'"'"']$//' || true)

if [ -z "$CRON_SECRET" ]; then
  echo "ERROR: CRON_SECRET not found in $ENV_FILE"
  echo "Generate one with: openssl rand -base64 32"
  echo "Then add to .env: CRON_SECRET=<value>"
  exit 1
fi

if [ -z "$NEXTAUTH_URL" ]; then
  echo "ERROR: NEXTAUTH_URL not found in $ENV_FILE"
  exit 1
fi

# Strip trailing slash
BASE_URL="${NEXTAUTH_URL%/}"

# Reject values that would break cron/shell quoting
# (checked AFTER BASE_URL is set so set -u doesn't fire)
if [[ "$CRON_SECRET" == *[\"\'%\*]* ]]; then
  echo "ERROR: CRON_SECRET contains unsafe characters (quotes, %, *). Regenerate with: openssl rand -hex 32"
  exit 1
fi
if [[ "$BASE_URL" == *[\"\'\`]* ]]; then
  echo "ERROR: NEXTAUTH_URL contains unsafe characters. Fix the value in $ENV_FILE"
  exit 1
fi

# ── Remove mode ──────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--remove" ]]; then
  log "Removing all memory cron jobs..."
  crontab -l 2>/dev/null | grep -v "$CRON_MARKER" | crontab - || true
  log "Done. Current crontab:"
  crontab -l 2>/dev/null || echo "(empty)"
  exit 0
fi

# ── Build cron entries ───────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"

# Note: % must be escaped as \% in crontab (unescaped % is treated as newline)
CURL_BASE="curl -s -o /dev/null -w '\%{http_code}' -X POST"
CURL_HEADERS="-H 'x-cron-secret: ${CRON_SECRET}' -H 'Content-Type: application/json'"

# Every 15 minutes: classify unclassified fresh_memory observations
CRON_PROCESS="*/15 * * * * ${CURL_BASE} ${CURL_HEADERS} ${BASE_URL}/api/memory/process >> ${LOG_DIR}/memory-cron.log 2>&1 # ${CRON_MARKER}"

# Daily 3am: promote eligible memory_ring entries to gut_patterns (collective)
CRON_CBP="0 3 * * * ${CURL_BASE} ${CURL_HEADERS} ${BASE_URL}/api/memory/cbp >> ${LOG_DIR}/memory-cron.log 2>&1 # ${CRON_MARKER}"

# Daily 4am: decay engine, cleanup forgotten memories, expire stale sessions
CRON_DECAY="0 4 * * * ${CURL_BASE} ${CURL_HEADERS} ${BASE_URL}/api/memory/decay >> ${LOG_DIR}/memory-cron.log 2>&1 # ${CRON_MARKER}"

# ── Install (idempotent — removes existing entries then re-adds) ─────────────
log "Installing memory cron jobs for $BASE_URL ..."

# Get existing crontab (without our marker lines)
EXISTING=$(crontab -l 2>/dev/null | grep -v "$CRON_MARKER" || true)

# Write new crontab
{
  [ -n "$EXISTING" ] && echo "$EXISTING"
  echo "$CRON_PROCESS"
  echo "$CRON_CBP"
  echo "$CRON_DECAY"
} | crontab -

log "Done. Installed 3 cron jobs:"
crontab -l | grep "$CRON_MARKER"
log ""
log "Verify cron is running: tail -f ${LOG_DIR}/memory-cron.log"
