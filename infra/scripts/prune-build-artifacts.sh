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

# The MCP package manager's uv cache. Default mirrors
# PackageManagerConfig.UV_CACHE_DIR in lib/mcp/package-manager/config.ts, which
# is PACKAGE_STORE_DIR/uv-cache; override it here the same way the app does.
UV_CACHE_DIR="${MCP_UV_CACHE_DIR:-/var/mcp-packages/uv-cache}"

log() { printf '[prune %s] %s\n' "$(date +%H:%M:%S)" "$*"; }
free_gb() { df -BG --output=avail / | tail -1 | tr -dc '0-9'; }

if [ "$INSTALL_TIMER" -eq 1 ]; then
  [ "$(id -u)" -eq 0 ] || { echo "--install-timer needs root" >&2; exit 1; }
  # Install a COPY rather than pointing at the git working tree. A systemd unit
  # aimed at a checkout breaks the moment anyone changes branch: the file is
  # only on the branch that added it, so switching to main deletes it and the
  # timer then fails silently every night. Same lesson as Traefik watching the
  # working tree — long-lived system state must not depend on which commit is
  # checked out.
  SELF="$(readlink -f "$0")"
  INSTALLED=/usr/local/sbin/pluggedin-prune-build-artefacts
  install -m 0755 -o root -g root "$SELF" "$INSTALLED"
  echo "installed ${INSTALLED} (copy of ${SELF})"
  cat > /etc/systemd/system/pluggedin-prune.service <<EOF
[Unit]
Description=Reclaim disk from Docker build artefacts
After=docker.service

[Service]
Type=oneshot
ExecStart=/bin/bash ${INSTALLED}
EOF
  cat > /etc/systemd/system/pluggedin-prune.timer <<'EOF'
[Unit]
Description=Daily prune of Docker build artefacts

[Timer]
# 04:20 rather than on the hour: nothing else on this host runs then, and the
# Ofelia jobs cluster at :00.
# Every six hours, not nightly. On 2026-09-02 the 04:20 run reported 168G free
# and the disk was full by 23:42 — a daily cadence cannot catch a fill that
# takes nineteen hours, and the cost of running this more often is a few
# seconds of docker and uv bookkeeping.
OnCalendar=*-*-* 00,06,12,18:20:00
Persistent=true
RandomizedDelaySec=600

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now pluggedin-prune.timer
  # `| head` closes the pipe early, systemd takes SIGPIPE, and with pipefail
  # that exit 141 propagates and kills the script before it reports success.
  # Observed for real: the confirmation line below never printed on the first
  # install, even though the timer had been created correctly. Harmless here,
  # but a non-zero exit from an installer is exactly what automation keys on.
  systemctl list-timers pluggedin-prune.timer --no-pager | head -2 || true
  echo
  echo "Re-run --install-timer after changing this script; the timer uses the"
  echo "installed copy, not the checkout, so edits in git do not take effect"
  echo "until they are installed."

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

# Record what the compose-referenced tags point at BEFORE pruning, so a tag the
# prune strips can be put back on the same image rather than on a guess.
COMPOSE_TAGS=(live)
TAG_SNAPSHOT=()
for tag in "${COMPOSE_TAGS[@]}"; do
  ref="ghcr.io/veriteknik/pluggedin-app:${tag}"
  if id_before=$(docker image inspect "$ref" --format '{{.Id}}' 2>/dev/null); then
    TAG_SNAPSHOT+=("${ref}=${id_before}")
  fi
done

run() { if [ "$DRY_RUN" -eq 1 ]; then echo "    would run: $*"; else "$@"; fi; }

log "system daemon — removing unused images older than ${SYSTEM_KEEP}"
# Informational, so it stays outside run(): during a dry run the point is to see
# which images are actually protected, and "would run: docker ps" shows nothing
# useful. It must not be able to abort the script either — a caller without
# docker access should still be able to read a dry run.
docker ps --format '  in use: {{.Image}}' 2>/dev/null | sort -u \
  || log "(could not list running containers — no docker access)"
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

# ─── The uv cache ──────────────────────────────────────────────────────────
#
# This is what actually filled the disk. On 2026-09-02 the timer ran at 04:21,
# reclaimed 2G of images and reported the disk 68% full with 168G free; by 23:42
# it was 100% full, Postgres was PANICking on every checkpoint, and Traefik had
# pulled the app out of the load balancer — the outage the header warns about,
# arriving from a direction it did not cover. `uv cache prune` then reclaimed
# 289 GiB.
#
# Docker retention was working the whole time: images were 16G of a 532G disk.
# The MCP package manager's uv cache had simply never been bounded.
#
# `prune`, not `clean`: prune removes only entries no longer referenced by an
# installed environment, so a cached wheel an MCP server still depends on stays.
# clean would empty it and make the next server start re-download everything.
#
# Run as the directory's owner rather than as root — root would leave
# root-owned entries behind that the app user could not later evict.
if [ -d "$UV_CACHE_DIR" ]; then
  CACHE_OWNER="$(stat -c '%U' "$UV_CACHE_DIR")"
  OWNER_HOME="$(getent passwd "$CACHE_OWNER" | cut -d: -f6)"

  # Resolve uv by absolute path rather than through PATH. `sudo -u` runs with a
  # minimal environment that does not include ~/.local/bin, which is where uv
  # installs itself — so a PATH lookup reports "not installed" on a host where
  # it plainly is, and the job silently skips the thing it exists to do. That
  # is worse than not having the job: the timer still exits 0.
  UV_BIN=""
  for candidate in "${OWNER_HOME}/.local/bin/uv" /usr/local/bin/uv /usr/bin/uv; do
    if [ -x "$candidate" ]; then UV_BIN="$candidate"; break; fi
  done

  if [ -n "$UV_BIN" ]; then
    log "uv cache (${UV_CACHE_DIR}, owner ${CACHE_OWNER}) — removing unreferenced entries"
    run sudo -u "$CACHE_OWNER" env UV_CACHE_DIR="$UV_CACHE_DIR" "$UV_BIN" cache prune
  else
    log "WARNING: uv not found for ${CACHE_OWNER} — the uv cache is NOT being pruned"
  fi
else
  log "no uv cache at ${UV_CACHE_DIR} — skipping"
fi

# Restore any tag the prune stripped off an image it otherwise kept (see the
# header). RESTORE is the operative word: the mapping is captured before
# pruning and put back exactly as it was.
#
# An earlier version re-pointed the tag at whatever container happened to be
# running. That is subtly wrong and was caught in review: during a rollback the
# running container is deliberately NOT the release :live names, so the cleanup
# job would have quietly rewritten deployment state to agree with the rollback,
# and the next `IMAGE_TAG=live` deploy would ship the rolled-back image. A
# cleanup task must never decide what :live means — it may only put back what
# it disturbed.
if [ "$DRY_RUN" -eq 0 ] && [ ${#TAG_SNAPSHOT[@]} -gt 0 ]; then
  for entry in "${TAG_SNAPSHOT[@]}"; do
    ref="${entry%%=*}"; was="${entry#*=}"
    if ! docker image inspect "$ref" >/dev/null 2>&1; then
      if docker image inspect "$was" >/dev/null 2>&1; then
        docker tag "$was" "$ref"
        log "restored ${ref} -> ${was} (prune had dropped the tag)"
      else
        log "WARNING: ${ref} was dropped and its image ${was} is gone; deploys using that tag will fail"
      fi
    fi
  done
fi

AFTER=$(free_gb)
log "disk after: ${AFTER}G free (reclaimed $((AFTER - BEFORE))G)"

# The running image is the one thing that must never become unreachable: if it
# exists in no registry, the local copy is the only copy and losing it means a
# rebuild rather than a redeploy.
#
# Distinguishing "absent" from "cannot tell" matters here. GHCR answers an
# unauthenticated request for ANY tag — real or invented — with `denied: denied`,
# so treating a non-zero exit as proof of absence produces a warning that is
# permanently wrong and quickly ignored. Root runs this timer and has no
# registry credentials, which is exactly the case that would misreport.
if REG_OUT=$(docker manifest inspect "ghcr.io/veriteknik/pluggedin-app:live" 2>&1); then
  log "ok — :live is present in GHCR"
else
  case "$REG_OUT" in
    *denied*|*unauthorized*|*authentication*|*"no basic auth"*)
      log "note: cannot check GHCR for :live (no registry credentials) — not asserting either way" ;;
    *)
      log "WARNING: :live is not in GHCR — the local image is the only copy" ;;
  esac
fi

# A prune that leaves the disk critically full is not a success; say so loudly
# so the timer's exit status carries the signal.
USED_PCT=$(df --output=pcent / | tail -1 | tr -dc '0-9')
# 85% on this disk is ~80G free, which sounds comfortable and is not: the fill
# that caused the outage moved faster than that between two runs. Warning at 75
# leaves a margin worth acting on rather than one worth noting.
if [ "$USED_PCT" -ge 75 ]; then
  echo "WARNING: / still ${USED_PCT}% full after pruning — investigate before it reaches Postgres" >&2
  echo "         largest consumers:" >&2
  du -xh --max-depth=2 /var /home 2>/dev/null | sort -rh | head -5 >&2
  exit 1
fi
log "ok — / is ${USED_PCT}% full"
