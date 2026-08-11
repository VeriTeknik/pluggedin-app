#!/usr/bin/env bash
# Pull-based automatic deployment.
#
# Runs on the production host as `pluggedin` under a systemd timer. Compares
# origin/main against the running container's revision label and deploys when
# they differ — subject to the infra gate (see gate_blocked_files).
#
# WHY POLLING RATHER THAN CI: infra/scripts/isolate-gha-runner.sh deliberately
# moved the Actions runner onto a rootless daemon as a separate user with no
# access to /etc/sops/age/keys.txt, /run/sops/secrets.env, or the production
# Docker socket. deploy.sh needs all three. A push-based deploy would mean
# handing those back. See docs/superpowers/specs/2026-08-10-auto-deploy-design.md.
#
# Usage:
#   deploy-watch.sh              # one poll cycle (what the timer runs)
#   deploy-watch.sh --status     # report state, change nothing
#   deploy-watch.sh --dry-run    # report what it would deploy; does not deploy
#                                 # or change state, but DOES run `git fetch`
#                                 # against origin to know what "latest" is
#   deploy-watch.sh --clear-failed
#                                 # a target that failed to deploy is never
#                                 # retried automatically (see --status); this
#                                 # clears that marker so the next cycle may
#                                 # retry it. Not needed to deploy a NEWER
#                                 # commit — that always proceeds on its own.
set -euo pipefail

# There is deliberately no REPO_ROOT here. This script must operate on
# $DEPLOY_TREE — the dedicated checkout pinned to the commit being deployed —
# never on whichever tree it happens to be invoked from. Deriving a path from
# BASH_SOURCE would reintroduce exactly the coupling the deploy tree exists to
# remove. shellcheck flagged the unused variable; the right fix was to delete
# it, not to silence the warning.
DEPLOY_TREE="${DEPLOY_TREE:-/home/pluggedin/deploy-tree}"
STATE_DIR="${STATE_DIR:-/var/lib/pluggedin-deploy-watch}"
IMAGE_REPO="${IMAGE_REPO:-ghcr.io/veriteknik/pluggedin-app}"
APP_CONTAINER="${APP_CONTAINER:-pluggedin-app}"
SITE_URL="${SITE_URL:-https://plugged.in}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_TREE}/infra/docker-compose.yml}"
# The app healthcheck declares start_period: 30s, and Traefik's own LB
# healthcheck only re-polls backend health every 30s, so a freshly deployed
# container can legitimately take up to ~60s before it is both healthy and
# actually reachable through the LB. external_check polls every 5s against a
# 90s (60s plus margin) WALL-CLOCK deadline — anchored to bash's $SECONDS,
# not accumulated sleep durations — so a slow or hung curl cannot silently
# inflate the real time this bounds. The true worst case is TIMEOUT plus at
# most one in-flight attempt's own duration (bounded by curl's --max-time,
# ~40s across the two curl calls one attempt makes), not TIMEOUT alone.
# Overridable so tests don't sleep.
EXTERNAL_CHECK_INTERVAL="${EXTERNAL_CHECK_INTERVAL:-5}"
EXTERNAL_CHECK_TIMEOUT="${EXTERNAL_CHECK_TIMEOUT:-90}"

log()  { printf '[deploy-watch %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die()  { printf '[deploy-watch] FATAL: %s\n' "$*" >&2; exit 1; }
now()  { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Resolver for lock file path, respecting STATE_DIR overrides after sourcing.
lock_file() {
  printf '%s/deploy-watch.lock' "${STATE_DIR}"
}

# --- state -----------------------------------------------------------------
# Flat key=value. Values are single-line and script-controlled, so no quoting
# rules are needed; state_set rewrites via mktemp + rename, never in place.
state_set() {
  local key="$1" value="$2" tmp
  local STATE_FILE="${STATE_DIR}/deploy-watch.state"
  mkdir -p "$STATE_DIR"
  touch "$STATE_FILE"
  tmp="$(mktemp "${STATE_FILE}.XXXXXX")"
  { grep -v "^${key}=" "$STATE_FILE" || true; printf '%s=%s\n' "$key" "$value"; } > "$tmp"
  mv -f "$tmp" "$STATE_FILE"
}

state_get() {
  local key="$1"
  local STATE_FILE="${STATE_DIR}/deploy-watch.state"
  [ -f "$STATE_FILE" ] || { printf ''; return 0; }
  sed -n "s/^${key}=//p" "$STATE_FILE" | tail -1
}

cmd_status() {
  printf 'deploy-watch status\n'
  printf '  last check      : %s\n' "$(state_get last_check)"
  printf '  running revision: %s\n' "$(state_get running_rev)"
  printf '  latest revision : %s\n' "$(state_get latest_rev)"
  printf '  last outcome    : %s\n' "$(state_get last_outcome)"
  local blocked
  blocked="$(state_get blocked_rev)"
  if [ -n "$blocked" ]; then
    printf '\n  BLOCKED by the infra gate: %s\n' "$blocked"
    printf '  files: %s\n' "$(state_get blocked_files)"
    printf '  This will not deploy automatically. Deploy it by hand:\n'
    printf '    IMAGE_TAG=sha-%s infra/scripts/deploy.sh\n' "$(state_get blocked_short)"
  fi
  local failed
  failed="$(state_get failed_rev)"
  if [ -n "$failed" ]; then
    printf '\n  DEPLOY FAILED for target %s — will NOT retry automatically.\n' "$failed"
    printf '  See "last outcome" above for why. To clear this and resume automatic\n'
    printf '  deploys, do ONE of:\n'
    printf '    1. Push a fix to main — a NEWER commit deploys on its own, no\n'
    printf '       clearing needed, that is the whole point of the feature.\n'
    printf '    2. Deploy this exact target by hand, which clears the marker on the\n'
    printf '       next cycle once the running revision catches up to it:\n'
    printf '         IMAGE_TAG=sha-%s infra/scripts/deploy.sh\n' "$(state_get failed_short)"
    printf '    3. Clear the marker without deploying, e.g. after fixing the\n'
    printf '       underlying problem out of band:\n'
    printf '         infra/scripts/deploy-watch.sh --clear-failed\n'
  fi
}

cmd_clear_failed() {
  state_set failed_rev ""
  state_set failed_short ""
  printf 'cleared: the next cycle may retry the previously-failed target.\n'
}

# --- revision and image resolution -----------------------------------------
running_revision() {
  # Empty (not an error) when the container does not exist: a first install
  # is a legitimate state, and the caller decides what to do about it.
  docker inspect "$APP_CONTAINER" \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
    2>/dev/null || printf ''
}

short_sha() { git -C "$DEPLOY_TREE" rev-parse --short=7 "$1"; }

image_exists() {
  # `docker manifest inspect` negotiates anonymous auth itself, which is what
  # we want: the host is logged out of ghcr.io and the package is public.
  # Same call infra/scripts/prune-build-artifacts.sh uses.
  docker manifest inspect "${IMAGE_REPO}:$1" >/dev/null 2>&1
}

fetch_tree() {
  [ -d "${DEPLOY_TREE}/.git" ] || die "deploy tree missing at ${DEPLOY_TREE} (see docs/ops/auto-deploy.md)"
  git -C "$DEPLOY_TREE" fetch --quiet origin main
  git -C "$DEPLOY_TREE" rev-parse origin/main
}

# --- the infra gate --------------------------------------------------------
# Only application-code changes deploy unattended.
#
# main allows merges with zero approving reviews and does not enforce branch
# protection on admins, and the repository is public. The compensating control
# has always been that a human runs deploy.sh; automating that removes it. A
# commit that can rewrite compose, the Dockerfile, a workflow, or a composite
# action is a commit that can change what the host mounts, what image gets
# built, and what the container can reach — on a host holding the SOPS age
# key. Those keep the human.
#
# Widened by the maintainer beyond the original spec, deliberately:
#   - any root-level Dockerfile variant, not just exactly `Dockerfile` —
#     `Dockerfile.production` exists at repo root today
#   - all of .github/, not just .github/workflows/ — composite actions under
#     .github/actions/ are invocable from gated workflows and are just as
#     capable of reaching secrets as the workflow YAML itself
#   - .dockerignore at root — it decides what lands in the build context,
#     and a loosened one can leak files into a published image
#
# Anchored at the start of the path so `app/infra/...`, `app/Dockerfile.md`,
# and a nested `app/.github/...` are NOT caught; only the real root-level
# paths are.
GATE_RE='^(infra/|docker-compose[^/]*\.yml$|Dockerfile[^/]*$|\.dockerignore$|\.github/)'

gate_blocked_files() {
  local from="$1" to="$2" diff_output
  # Fail-closed. If either endpoint is unknown to this tree the range cannot
  # be judged, and "cannot judge" must never read as "nothing to worry about".
  git -C "$DEPLOY_TREE" cat-file -e "${from}^{commit}" 2>/dev/null || return 1
  git -C "$DEPLOY_TREE" cat-file -e "${to}^{commit}"   2>/dev/null || return 1
  # --no-renames: without it, git collapses a gated-path -> non-gated-path
  # move into a single rename line naming only the new (unmatched) path, and
  # the protected old path never appears in --name-only output at all. Forcing
  # a plain delete+add keeps the old path visible to the grep below.
  #
  # Every commit that would go live, not just the tip: an infra change must not
  # ride to production hidden behind a later innocuous commit.
  #
  # The git diff itself is captured (and its exit status checked) separately
  # from the grep filter, so only grep's "no match" (exit 1) is swallowed by
  # `|| true` below. A genuine git diff failure must propagate as blocked, not
  # be indistinguishable from "nothing matched."
  diff_output="$(git -C "$DEPLOY_TREE" diff --no-renames --name-only "$from" "$to")" || return 1
  grep -E "$GATE_RE" <<< "$diff_output" || true
}

# --- deploying -------------------------------------------------------------
range_touches_migrations() {
  # backup.sh dumps Postgres AND rsyncs uploads and vector data into an
  # age-encrypted tarball — minutes and gigabytes. Far too heavy to run on
  # every app patch, and pointless when the schema cannot change.
  #
  # Capture-then-grep, not a `git diff | grep -q` pipeline: under `set -o
  # pipefail`, `grep -q` can exit the instant it finds a match, sending git a
  # SIGPIPE it hasn't finished writing into; pipefail then surfaces that as
  # this function's exit status. Same shape as gate_blocked_files above, for
  # the same reason (see commit 6e924477, which hit this exact class on a
  # different pipeline).
  #
  # A genuine `git diff` failure also fails closed here: treat "cannot tell"
  # as "yes, might touch migrations" so the deploy takes the safe backup +
  # migrate path rather than silently skipping it.
  local out
  out="$(git -C "$DEPLOY_TREE" diff --name-only "$1" "$2")" || return 0
  grep -qE '^drizzle/' <<< "$out"
}

external_check() {
  local interval="$EXTERNAL_CHECK_INTERVAL"
  # A non-positive (or non-numeric) interval must never be used to sleep: at
  # 0 the loop would spin hot between deadline checks. The deadline below is
  # what actually bounds total time spent here; this floor only protects the
  # gap between attempts. Reachable by configuration (both vars are
  # documented as overridable), so guarded explicitly rather than assumed.
  [ "$interval" -gt 0 ] 2>/dev/null || interval=1

  # Wall-clock deadline, not accumulated sleep: computed once, compared
  # against bash's $SECONDS (which counts real elapsed seconds since shell
  # start, not sleep calls) on every iteration. A curl that takes far longer
  # than $interval — hung backend, slow TLS, whatever — no longer lets the
  # loop run for a multiple of the intended budget; the worst case is
  # bounded by curl's own --max-time regardless of how the sleeps land.
  local deadline=$((SECONDS + EXTERNAL_CHECK_TIMEOUT))
  local code
  while true; do
    code="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 20 "${SITE_URL}/api/health" 2>/dev/null || echo 000)"
    if [ "$code" = "200" ] \
         && curl -fsS --max-time 20 "${SITE_URL}/api/health" 2>/dev/null | grep -q '"status":"healthy"'; then
      return 0
    fi
    [ "$SECONDS" -ge "$deadline" ] && return 1
    sleep "$interval"
  done
}

# Deploys exactly one attempt at ("$short", "$rev"); never loops or retries
# internally. CRITICAL C1: the caller (main, at the bottom of this file)
# records "$rev" as failed_rev on a non-zero return and will not call this
# again for the same target on its own — one attempt per target, not a
# bounded retry budget. Reasoning: every attempt whose range touches
# drizzle/ costs a full backup.sh run (minutes, gigabytes) before it even
# reaches the step that might fail again, there is no notification channel
# to say a retry budget was burned, and a genuinely broken target (bad
# migration, image that fails health checks) will not start passing on
# attempt 2 or 3 with no code change in between — only a fix pushed as a
# NEW commit, or a human, changes the outcome. A bounded retry count would
# buy nothing here but disk and Postgres load.
do_deploy() {
  local short="$1" rev="$2" from="$3"
  local prev_image prev_rev
  prev_image="$(docker inspect "$APP_CONTAINER" --format '{{.Image}}' 2>/dev/null || printf '')"
  prev_rev="$(running_revision)"

  log "deploying ${short} (${rev})"
  # Every command from here on that runs before the rollback branch is
  # explicitly guarded (`if`/`||`), never bare. Under `set -e` a bare command
  # that fails aborts the whole function immediately — including the
  # rollback block and every state_set below it — leaving a broken deploy
  # running in production with `--status` still showing the PREVIOUS cycle's
  # (stale, now-false) "ok". A guarded failure is a reported failure; a bare
  # one is a silent one.
  if ! git -C "$DEPLOY_TREE" checkout --quiet --detach "$rev"; then
    state_set last_outcome "failed: checkout ${rev} (stack untouched)"
    return 1
  fi

  # Pull before backup/migrate, matching the design
  # (docs/superpowers/specs/2026-08-10-auto-deploy-design.md: "pull ->
  # backup -> migrate -> up"). This also keeps the "(stack untouched)"
  # wording in the two failure branches below honest: nothing that can
  # change the running container or its schema has happened yet, so a pull
  # or tag failure genuinely leaves the stack untouched. Pulling first also
  # means the migration step below never has to fall back to an implicit
  # `docker compose run` auto-pull of the image it migrates against.
  if ! docker pull "${IMAGE_REPO}:sha-${short}" >/dev/null; then
    state_set last_outcome "failed: pull (stack untouched)"
    return 1
  fi
  if ! docker tag "${IMAGE_REPO}:sha-${short}" "${IMAGE_REPO}:live"; then
    state_set last_outcome "failed: tag (stack untouched)"
    return 1
  fi

  if range_touches_migrations "$from" "$rev"; then
    log "range touches drizzle/ — taking a backup first"
    "${DEPLOY_TREE}/infra/scripts/backup.sh" || { state_set last_outcome "failed: backup (stack untouched)"; return 1; }

    # Migrate BEFORE the app is replaced. A failure here leaves the running
    # container untouched: old code against the unmigrated schema, which is a
    # clean failure rather than a half-deployed one.
    log "running migrations"
    if ! IMAGE_TAG="sha-${short}" docker compose -f "$COMPOSE_FILE" \
           run --rm pluggedin-app node_modules/.bin/drizzle-kit migrate; then
      state_set last_outcome "failed: migration (stack untouched)"
      return 1
    fi
  fi

  if IMAGE_TAG=live "${DEPLOY_TREE}/infra/scripts/deploy.sh" --no-pull && external_check; then
    state_set last_outcome "ok ${short} at $(now)"
    state_set running_rev "$rev"
    log "deploy ok"
    return 0
  fi

  log "verification failed — rolling back to ${prev_rev:-previous image}"
  local rollback_state
  if [ -z "$prev_image" ]; then
    # Nothing to roll back to: no prior running container, or `docker
    # inspect` itself failed. Say so — this must never be conflated with a
    # rollback that actually happened.
    rollback_state="NO ROLLBACK POSSIBLE (previous image unknown)"
  elif docker tag "$prev_image" "${IMAGE_REPO}:live" \
         && IMAGE_TAG=live "${DEPLOY_TREE}/infra/scripts/deploy.sh" --no-pull \
         && external_check; then
    rollback_state="rolled back and verified"
  else
    # The retag and/or redeploy may have partly landed; external_check did
    # not confirm the rollback itself is healthy. Distinct from "rolled back
    # and verified" on purpose — this needs a human to look, not a shrug.
    rollback_state="rollback attempted but NOT verified"
  fi

  if range_touches_migrations "$from" "$rev"; then
    # The image may be back; the schema is not, and never was rolled back by
    # this script. Say so plainly — this is the one outcome that must never
    # read as self-healed.
    state_set last_outcome "${rollback_state}: ${short} at $(now) — MIGRATION ALREADY APPLIED, needs a human"
  else
    state_set last_outcome "${rollback_state}: ${short} at $(now)"
  fi
  return 1
}

main() {
  local dry=0
  case "${1:-}" in
    --status)       cmd_status; return 0 ;;
    --dry-run)      dry=1 ;;
    --clear-failed) cmd_clear_failed; return 0 ;;
    -h|--help) sed -n '2,25p' "$0" | sed 's/^# \?//'; return 0 ;;
    "")        ;;
    *)         die "unknown argument: $1" ;;
  esac

  mkdir -p "$STATE_DIR"
  # Never let two cycles overlap; the timer fires regardless of how long a
  # deploy takes.
  LOCK_FILE="$(lock_file)"
  exec 9>"$LOCK_FILE"
  flock -n 9 || { log "another cycle holds the lock — skipping"; return 0; }

  local target running short
  target="$(fetch_tree)"
  running="$(running_revision)"
  state_set last_check "$(now)"
  state_set latest_rev "$target"
  state_set running_rev "$running"

  [ -n "$running" ] || die "container ${APP_CONTAINER} not running — refusing to guess a baseline"

  # A human can deploy a gated commit by hand at any time (that's the whole
  # point of the gate) without this script ever seeing a clean range. Once
  # the running revision has caught up to (or passed) whatever was blocked,
  # the block is stale — clear it, or `--status` reports BLOCKED forever
  # even though production is already running that commit.
  local prev_blocked
  prev_blocked="$(state_get blocked_rev)"
  if [ -n "$prev_blocked" ] \
       && git -C "$DEPLOY_TREE" cat-file -e "${prev_blocked}^{commit}" 2>/dev/null \
       && git -C "$DEPLOY_TREE" merge-base --is-ancestor "$prev_blocked" "$running" 2>/dev/null; then
    log "blocked revision ${prev_blocked} is now running (hand-deployed?) — clearing the block"
    state_set blocked_rev ""
    state_set blocked_short ""
    state_set blocked_files ""
  fi

  # Same idea for a target that previously FAILED to deploy (see the
  # failed_rev check below, and CRITICAL finding C1): if a human has since
  # hand-deployed it (or something past it) and the running revision has
  # caught up, the marker is stale — clear it rather than have --status
  # report a failure forever after it has plainly been resolved.
  local prev_failed
  prev_failed="$(state_get failed_rev)"
  if [ -n "$prev_failed" ] \
       && git -C "$DEPLOY_TREE" cat-file -e "${prev_failed}^{commit}" 2>/dev/null \
       && git -C "$DEPLOY_TREE" merge-base --is-ancestor "$prev_failed" "$running" 2>/dev/null; then
    log "previously failed target ${prev_failed} is now running (hand-deployed?) — clearing the failure marker"
    state_set failed_rev ""
    state_set failed_short ""
  fi

  if [ "$running" = "$target" ]; then
    log "up to date at $(short_sha "$target")"
    return 0
  fi

  short="$(short_sha "$target")"

  # CRITICAL C1: a target that already failed must not be retried
  # automatically by a later cycle — see do_deploy's failure branches and
  # the state_set at the bottom of this function. Retrying blind, every 2
  # minutes, forever, is what turned one failed deploy into ~240 encrypted
  # backups and ~480 container replacements overnight (a migrating deploy
  # costs a full backup on every attempt). A NEWER commit (this check
  # compares against the exact failed SHA, not "anything still pending")
  # is unaffected and deploys normally — that is the whole point of the
  # feature, and is exactly how a fix pushed after a bad deploy gets live.
  if [ "$target" = "$prev_failed" ]; then
    log "target ${target} already failed a previous attempt — not retrying automatically (see --status, or infra/scripts/deploy-watch.sh --clear-failed)"
    return 0
  fi

  if ! image_exists "sha-${short}"; then
    log "image sha-${short} not published yet — waiting"
    return 0
  fi

  local blocked
  if ! blocked="$(gate_blocked_files "$running" "$target")"; then
    state_set blocked_rev "$target"
    state_set blocked_short "$short"
    state_set blocked_files "unevaluable range — failing closed"
    log "BLOCKED: cannot evaluate ${running}..${target}"
    return 0
  fi
  if [ -n "$blocked" ]; then
    state_set blocked_rev "$target"
    state_set blocked_short "$short"
    state_set blocked_files "$(printf '%s' "$blocked" | tr '\n' ' ')"
    log "BLOCKED by the infra gate: $(printf '%s' "$blocked" | tr '\n' ' ')"
    log "deploy it by hand: IMAGE_TAG=sha-${short} infra/scripts/deploy.sh"
    return 0
  fi

  if [ "$dry" -eq 1 ]; then
    log "DRY RUN: would deploy sha-${short} (${target}); gate clear"
    range_touches_migrations "$running" "$target" \
      && log "DRY RUN: range touches drizzle/ — would back up and migrate first" \
      || log "DRY RUN: no migrations in range"
    return 0
  fi

  state_set blocked_rev ""
  state_set blocked_files ""

  if do_deploy "$short" "$target" "$running"; then
    return 0
  fi
  # Record the failed target so the check above refuses to retry it on the
  # next cycle. do_deploy has already written the specific reason to
  # last_outcome; this is deliberately just the target, not a retry count —
  # see the C1 fix note above do_deploy for why one-and-stop, not a bounded
  # number of automatic retries.
  state_set failed_rev "$target"
  state_set failed_short "$short"
  return 1
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
