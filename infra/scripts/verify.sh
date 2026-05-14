#!/usr/bin/env bash
# Stack-level smoke test. Run after every deploy. Exits non-zero if anything
# below regresses; intended to be safe to run on a live production stack.
#
#  - Traefik: /ping returns OK
#  - Postgres: pg_isready and SELECT 1
#  - Redis:    PING returns PONG
#  - App:      /api/health returns 200 with status: "ok"
#  - RAG:      the "GSLB" canary query returns the VeriTeknik doc
#              (this is exactly the failure mode that motivated the docker
#              migration — see docs/ops/docker-traefik-sops-migration.md)
#
# Usage:
#   infra/scripts/verify.sh             # everything
#   infra/scripts/verify.sh --app       # only app + canary
#   infra/scripts/verify.sh --quick     # skip canary (faster, no Gemini call)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/infra/docker-compose.yml"
COMPOSE=(docker compose -f "$COMPOSE_FILE")

MODE=full
for arg in "$@"; do
  case "$arg" in
    --app)   MODE=app ;;
    --quick) MODE=quick ;;
    -h|--help) sed -n '2,18p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "verify.sh: unknown arg: $arg" >&2; exit 2 ;;
  esac
done

pass() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$*"; exit 1; }
hdr()  { printf '\n[verify] %s\n' "$*"; }

if [ "$MODE" != "app" ]; then
  hdr "traefik"
  "${COMPOSE[@]}" exec -T traefik traefik healthcheck --ping >/dev/null \
    && pass "ping" || fail "ping"

  hdr "postgres"
  "${COMPOSE[@]}" exec -T postgres pg_isready -U "${POSTGRES_USER:-pluggedin}" -d "${POSTGRES_DB:-v220_prod}" >/dev/null \
    && pass "pg_isready" || fail "pg_isready"
  "${COMPOSE[@]}" exec -T postgres psql -U "${POSTGRES_USER:-pluggedin}" -d "${POSTGRES_DB:-v220_prod}" -tA -c 'SELECT 1' | grep -q '^1$' \
    && pass "SELECT 1" || fail "SELECT 1"

  hdr "redis"
  "${COMPOSE[@]}" exec -T redis redis-cli PING | grep -q PONG \
    && pass "PING" || fail "PING"
fi

hdr "pluggedin-app /api/health"
APP_HEALTH=$("${COMPOSE[@]}" exec -T pluggedin-app wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null || true)
echo "$APP_HEALTH" | grep -q '"status":"ok"' \
  && pass "/api/health → ok" \
  || fail "/api/health → $APP_HEALTH"

hdr "pluggedin-rc1 /api/health"
RC1_HEALTH=$("${COMPOSE[@]}" exec -T pluggedin-rc1 wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null || true)
echo "$RC1_HEALTH" | grep -q '"status":"ok"' \
  && pass "/api/health → ok" \
  || fail "/api/health → $RC1_HEALTH"

if [ "$MODE" = "quick" ]; then
  hdr "skipping canary (--quick)"
  exit 0
fi

# RAG canary. The "GSLB" query is meaningless on a fresh DB; we only run it
# when CANARY_API_KEY is set (i.e. on the production stack with real data).
if [ -n "${CANARY_API_KEY:-}" ]; then
  hdr "rag canary"
  RESP=$("${COMPOSE[@]}" exec -T pluggedin-app sh -c "
    wget -qO- --header 'Content-Type: application/json' \
              --header 'Authorization: Bearer ${CANARY_API_KEY}' \
              --post-data '{\"query\":\"GSLB\",\"includeMetadata\":true}' \
              http://127.0.0.1:3000/api/rag/query
  " 2>/dev/null || true)
  echo "$RESP" | grep -qi 'VeriTeknik Comprehensive' \
    && pass "GSLB → VeriTeknik Comprehensive" \
    || fail "GSLB canary missed: ${RESP:0:200}"
else
  hdr "rag canary skipped (set CANARY_API_KEY to run)"
fi

echo
echo "[verify] all green"
