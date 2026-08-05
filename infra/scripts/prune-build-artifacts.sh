#!/usr/bin/env bash
# Reclaim disk from build artefacts on the production host.
#
#   sudo bash infra/scripts/prune-build-artifacts.sh [--dry-run]
#
# Installed as a systemd timer by --install-timer; see the bottom of this file.
#
# WHY THIS EXISTS
#   CI builds a ~4 GB image on every push, on the same machine that serves
#   production. With no retention the disk reached 75% before a manual prune
#   reclaimed 113 GB. If it ever fills, Postgres goes down with it — the
#   failure is not "CI gets slow", it is an outage.
#
# TWO DAEMONS, DIFFERENT RULES
#   system daemon  — runs production. Images here are either in use (protected
#                    by docker itself) or recent manual builds that may be a
#                    rollback target, so the window is deliberately generous.
#   rootless daemon — the Actions runner's, since infra/scripts/isolate-gha-runner.sh.
#                    Everything it builds is pushed to GHCR, so a local copy has
#                    no rollback value and the window is short.
#
# WHAT IS NEVER REMOVED
#   Images backing a running container. `docker image prune -a` skips those, so
#   traefik, postgres, redis, ofelia, the socket proxy and the live app image
#   survive without an allow-list that could drift.
#
#   TAGS ARE A DIFFERENT MATTER, and this bit is genuinely surprising: prune
#   can drop a TAG from an image it is otherwise protecting. Observed here — a
#   run removed `:live` while keeping the image, because the container holds it
#   by ID and no longer needs the name. The stack still ran, but
#   `IMAGE_TAG=live docker compose up` would then find nothing locally and try
#   to pull a tag that does not exist in the registry, so the next deploy
#   breaks rather than the current one. The script re-asserts the tags compose
#   depends on afterwards.
set -euo pipefail

DRY_RUN=0
INSTALL_TIMER=0
for arg in "$@"; do
  case "$arg" in
    --dry-run)       DRY_RUN=1 ;;
    --install-timer) INSTALL_TIMER=1 ;;
    -h|--help) sed -n '2,30p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

RUNNER_USER="${RUNNER_USER:-ghrunner}"
# Generous on the box that serves traffic: a manual build is sometimes the only
# copy of a rollback target, because only CI pushes to GHCR.
SYSTEM_KEEP="${SYSTEM_KEEP:-72h}"
# Short for CI output: every one of those images exists in GHCR as well.
RUNNER_KEEP="${RUNNER_KEEP:-24h}"

log() { printf '[prune %s] %s\n' "$(date +%H:%M:%S)" "$*"; }
free_gb() { df -BG --output=avail / | tail -1 | tr -dc '0-9'; }

if [ "$INSTALL_TIMER" -eq 1 ]; then
  [ "$(id -u)" -eq 0 ] || { echo "--install-timer needs root" >&2; exit 1; }
  SELF="$(readlink -f "$0")"
  cat > /etc/systemd/system/pluggedin-prune.service <<EOF
[Unit]
Description=Reclaim disk from Docker build artefacts
After=docker.service

[Service]
Type=oneshot
ExecStart=/bin/bash ${SELF}
EOF
  cat > /etc/systemd/system/pluggedin-prune.timer <<'EOF'
[Unit]
Description=Daily prune of Docker build artefacts

[Timer]
# 04:20 rather than on the hour: nothing else on this host runs then, and the
# Ofelia jobs cluster at :00.
OnCalendar=*-*-* 04:20:00
Persistent=true
RandomizedDelaySec=600

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now pluggedin-prune.timer
  systemctl list-timers pluggedin-prune.timer --no-pager | head -2
  echo "timer installed; it will also run now if a scheduled run was missed"
  exit 0
fi

# Root is needed to prune, but not to inspect. A dry run has to be reviewable
# without handing anyone privileges to see what it would do.
if [ "$DRY_RUN" -eq 0 ] && [ "$(id -u)" -ne 0 ]; then
  echo "run me with sudo (or pass --dry-run to see what it would do)" >&2
  exit 1
fi

BEFORE=$(free_gb)
log "disk before: ${BEFORE}G free"

run() { if [ "$DRY_RUN" -eq 1 ]; then echo "    would run: $*"; else "$@"; fi; }

log "system daemon — removing unused images older than ${SYSTEM_KEEP}"
docker ps --format '  in use: {{.Image}}' | sort -u
run docker image   prune -af --filter "until=${SYSTEM_KEEP}"
run docker builder prune -af --filter "until=${SYSTEM_KEEP}"

# The runner's daemon is user-scoped, so this has to cross into that user.
# Skipped rather than failed when absent: this script should stay useful on a
# host that has no runner.
if id -u "$RUNNER_USER" >/dev/null 2>&1; then
  RUNNER_UID="$(id -u "$RUNNER_USER")"
  SOCK="unix:///run/user/${RUNNER_UID}/docker.sock"
  if sudo -u "$RUNNER_USER" env DOCKER_HOST="$SOCK" docker info >/dev/null 2>&1; then
    log "rootless daemon (${RUNNER_USER}) — removing unused images older than ${RUNNER_KEEP}"
    run sudo -u "$RUNNER_USER" env DOCKER_HOST="$SOCK" \
      docker image prune -af --filter "until=${RUNNER_KEEP}"
    run sudo -u "$RUNNER_USER" env DOCKER_HOST="$SOCK" \
      docker builder prune -af --filter "until=${RUNNER_KEEP}"
  else
    log "rootless daemon not reachable — skipping (is it running?)"
  fi
else
  log "no ${RUNNER_USER} user — skipping the rootless daemon"
fi

# Re-assert the tags the compose file resolves. Pruning can strip a tag from a
# still-protected image (see the header), which leaves the running stack fine
# and the next deploy broken — the worst shape for a failure, because nothing
# looks wrong until someone deploys.
if [ "$DRY_RUN" -eq 0 ]; then
  RUNNING_IMAGE_ID=$(docker inspect pluggedin-app --format '{{.Image}}' 2>/dev/null || true)
  if [ -n "$RUNNING_IMAGE_ID" ]; then
    for tag in live; do
      ref="ghcr.io/veriteknik/pluggedin-app:${tag}"
      if ! docker image inspect "$ref" >/dev/null 2>&1; then
        docker tag "$RUNNING_IMAGE_ID" "$ref"
        log "re-tagged ${ref} onto the running image (prune had dropped the tag)"
      fi
    done
  fi
fi

AFTER=$(free_gb)
log "disk after: ${AFTER}G free (reclaimed $((AFTER - BEFORE))G)"

# The running image is the one thing that must never become unreachable. If it
# exists in no registry, the local copy is the only copy and losing it means a
# rebuild, not a redeploy.
if ! docker manifest inspect "ghcr.io/veriteknik/pluggedin-app:live" >/dev/null 2>&1; then
  log "note: :live is not in GHCR — the local image is the only copy"
fi

# A prune that leaves the disk critically full is not a success; say so loudly
# so the timer's exit status carries the signal.
USED_PCT=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ "$USED_PCT" -ge 85 ]; then
  echo "WARNING: / still ${USED_PCT}% full after pruning — investigate before it reaches Postgres" >&2
  exit 1
fi
log "ok — / is ${USED_PCT}% full"
