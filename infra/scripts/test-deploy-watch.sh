#!/usr/bin/env bash
# Test harness for deploy-watch.sh.
#
# Stubs docker/git/curl by putting fake executables first on PATH, then
# sources deploy-watch.sh (whose main() is guarded) and calls its functions
# directly. Run: infra/scripts/test-deploy-watch.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0
FAIL=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; PASS=$((PASS + 1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }
is()   { # is <actual> <expected> <label>
  if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (got '$1', want '$2')"; fi
}

setup() {
  TESTROOT="$(mktemp -d)"
  export STATE_DIR="${TESTROOT}/state"
  export DEPLOY_TREE="${TESTROOT}/tree"
  mkdir -p "$STATE_DIR" "$DEPLOY_TREE"
}
teardown() { rm -rf "$TESTROOT"; }

# shellcheck source=/dev/null
source "${SCRIPT_DIR}/deploy-watch.sh"
# Sourcing the script under test inherits set -e, which would abort on
# the first non-zero assertion. Reset it so the harness can report all failures.
set +e

printf '\n[test] state file\n'
setup
state_set last_check "2026-08-11T00:00:00Z"
state_set running_rev "abc123"
is "$(state_get last_check)" "2026-08-11T00:00:00Z" "state_get reads back what state_set wrote"
is "$(state_get running_rev)" "abc123" "second key stored independently"
state_set running_rev "def456"
is "$(state_get running_rev)" "def456" "state_set replaces rather than appends"
is "$(grep -c '^running_rev=' "${STATE_DIR}/deploy-watch.state")" "1" "no duplicate keys accumulate"
is "$(state_get never_set)" "" "missing key yields empty string"
teardown

printf '\n[test] revision resolution\n'
setup
# A real git repo, so short_sha and fetch_tree exercise real git behaviour.
git -C "$DEPLOY_TREE" init -q
git -C "$DEPLOY_TREE" config user.email t@example.com
git -C "$DEPLOY_TREE" config user.name  Test
echo one > "$DEPLOY_TREE/a.txt"
git -C "$DEPLOY_TREE" add a.txt
git -C "$DEPLOY_TREE" commit -qm one
REV="$(git -C "$DEPLOY_TREE" rev-parse HEAD)"
is "$(short_sha "$REV")" "${REV:0:7}" "short_sha abbreviates to exactly 7 characters"
is "${#REV}" "40" "test fixture revision is a full SHA"

# Stub docker so image_exists is deterministic.
STUBS="${TESTROOT}/bin"; mkdir -p "$STUBS"
cat > "$STUBS/docker" <<'STUB'
#!/usr/bin/env bash
# manifest inspect <repo>:<tag> — only sha-present resolves
if [ "$1" = "manifest" ] && [ "$2" = "inspect" ]; then
  case "$3" in
    *:sha-present) exit 0 ;;
    *) echo "manifest unknown" >&2; exit 1 ;;
  esac
fi
if [ "$1" = "inspect" ]; then
  # inspect <container> --format ... — print the fixture revision
  if [ -n "${STUB_RUNNING_REV:-}" ]; then echo "$STUB_RUNNING_REV"; exit 0; fi
  echo "No such object" >&2; exit 1
fi
exit 0
STUB
chmod +x "$STUBS/docker"
PATH="$STUBS:$PATH"

image_exists "sha-present" && ok "image_exists true for a tag the registry resolves" \
  || bad "image_exists true for a tag the registry resolves"
image_exists "sha-absent" && bad "image_exists false for an absent tag" \
  || ok "image_exists false for an absent tag"

STUB_RUNNING_REV="$REV" is "$(STUB_RUNNING_REV="$REV" running_revision)" "$REV" \
  "running_revision reads the container label"
is "$(running_revision)" "" "running_revision is empty when the container is absent"
teardown

printf '\n[test] infra gate\n'
setup
git -C "$DEPLOY_TREE" init -q
git -C "$DEPLOY_TREE" config user.email t@example.com
git -C "$DEPLOY_TREE" config user.name  Test
mkdir -p "$DEPLOY_TREE"/{app,infra/scripts,.github/workflows,drizzle}
echo base > "$DEPLOY_TREE/app/page.tsx"
git -C "$DEPLOY_TREE" add -A; git -C "$DEPLOY_TREE" commit -qm base
BASE="$(git -C "$DEPLOY_TREE" rev-parse HEAD)"

commit_file() { # commit_file <path> <content> -> prints new SHA
  mkdir -p "$(dirname "${DEPLOY_TREE}/$1")"
  echo "$2" > "${DEPLOY_TREE}/$1"
  git -C "$DEPLOY_TREE" add -A
  git -C "$DEPLOY_TREE" commit -qm "touch $1"
  git -C "$DEPLOY_TREE" rev-parse HEAD
}

APP="$(commit_file app/page.tsx changed)"
is "$(gate_blocked_files "$BASE" "$APP")" "" "app-only change is not blocked"

INFRA="$(commit_file infra/scripts/deploy.sh changed)"
is "$(gate_blocked_files "$APP" "$INFRA")" "infra/scripts/deploy.sh" "infra/ change is blocked"

COMPOSE="$(commit_file docker-compose.production.yml changed)"
is "$(gate_blocked_files "$INFRA" "$COMPOSE")" "docker-compose.production.yml" "root compose change is blocked"

DOCKERFILE="$(commit_file Dockerfile changed)"
is "$(gate_blocked_files "$COMPOSE" "$DOCKERFILE")" "Dockerfile" "Dockerfile change is blocked"

WF="$(commit_file .github/workflows/build-image.yml changed)"
is "$(gate_blocked_files "$DOCKERFILE" "$WF")" ".github/workflows/build-image.yml" "workflow change is blocked"

# Paths that merely look like the protected ones must NOT be blocked.
DECOY="$(commit_file app/infra/helper.ts changed)"
is "$(gate_blocked_files "$WF" "$DECOY")" "" "app/infra/ is not the protected infra/ prefix"
DECOY2="$(commit_file app/Dockerfile.md changed)"
is "$(gate_blocked_files "$DECOY" "$DECOY2")" "" "a nested Dockerfile.md is not the root Dockerfile"
DECOY3="$(commit_file drizzle/0001_x.sql changed)"
is "$(gate_blocked_files "$DECOY2" "$DECOY3")" "" "migrations are app changes, not infra"

# The range, not just the tip: an infra commit buried behind an app commit
# must still block.
BURIED_INFRA="$(commit_file infra/docker-compose.yml changed)"
BURIED_APP="$(commit_file app/page.tsx again)"
is "$(gate_blocked_files "$DECOY3" "$BURIED_APP")" "infra/docker-compose.yml" \
  "an infra commit behind a later app commit still blocks the range"

# Fail-closed: an unknown starting revision cannot be evaluated.
if gate_blocked_files "0000000000000000000000000000000000000000" "$BURIED_APP" >/dev/null 2>&1; then
  bad "unknown revision must not evaluate as allowed"
else
  ok "unknown revision fails closed"
fi
teardown

printf '\n[test] infra gate: rename bypass\n'
setup
git -C "$DEPLOY_TREE" init -q
git -C "$DEPLOY_TREE" config user.email t@example.com
git -C "$DEPLOY_TREE" config user.name  Test
mkdir -p "$DEPLOY_TREE/infra/scripts"
echo x > "$DEPLOY_TREE/infra/scripts/verify.sh"
git -C "$DEPLOY_TREE" add -A; git -C "$DEPLOY_TREE" commit -qm "add verify.sh"
R1="$(git -C "$DEPLOY_TREE" rev-parse HEAD)"
mkdir -p "$DEPLOY_TREE/scripts"
git -C "$DEPLOY_TREE" mv infra/scripts/verify.sh scripts/verify.sh
git -C "$DEPLOY_TREE" commit -qm "move verify.sh out of infra/"
R2="$(git -C "$DEPLOY_TREE" rev-parse HEAD)"
is "$(gate_blocked_files "$R1" "$R2")" "infra/scripts/verify.sh" \
  "renaming a gated path to a non-gated path still blocks (old path surfaces via --no-renames)"
teardown

printf '\n[test] infra gate: widened scope\n'
setup
git -C "$DEPLOY_TREE" init -q
git -C "$DEPLOY_TREE" config user.email t@example.com
git -C "$DEPLOY_TREE" config user.name  Test
mkdir -p "$DEPLOY_TREE"/{app,.github/workflows,.github/actions/build}
echo base > "$DEPLOY_TREE/app/page.tsx"
git -C "$DEPLOY_TREE" add -A; git -C "$DEPLOY_TREE" commit -qm base
BASE2="$(git -C "$DEPLOY_TREE" rev-parse HEAD)"

DFVAR="$(commit_file Dockerfile.production changed)"
is "$(gate_blocked_files "$BASE2" "$DFVAR")" "Dockerfile.production" \
  "a root Dockerfile variant is blocked"

ACTION="$(commit_file .github/actions/build/action.yml changed)"
is "$(gate_blocked_files "$DFVAR" "$ACTION")" ".github/actions/build/action.yml" \
  "a composite action under .github/ is blocked, not just .github/workflows/"

DOCKERIGNORE="$(commit_file .dockerignore changed)"
is "$(gate_blocked_files "$ACTION" "$DOCKERIGNORE")" ".dockerignore" \
  "root .dockerignore is blocked"

# Newly covered patterns must still respect root-only anchoring.
DECOY_DF="$(commit_file app/Dockerfile.x changed)"
is "$(gate_blocked_files "$DOCKERIGNORE" "$DECOY_DF")" "" \
  "Dockerfile.x nested under a subdirectory is not the root Dockerfile"

DECOY_GH="$(commit_file app/.github/workflows/x.yml changed)"
is "$(gate_blocked_files "$DECOY_DF" "$DECOY_GH")" "" \
  "a nested .github under a subdirectory is not the protected root .github/"
teardown

printf '\n[test] infra gate: git diff failure fails closed\n'
setup
git -C "$DEPLOY_TREE" init -q
git -C "$DEPLOY_TREE" config user.email t@example.com
git -C "$DEPLOY_TREE" config user.name  Test
echo one > "$DEPLOY_TREE/a.txt"
git -C "$DEPLOY_TREE" add a.txt
git -C "$DEPLOY_TREE" commit -qm one
R1="$(git -C "$DEPLOY_TREE" rev-parse HEAD)"
echo two > "$DEPLOY_TREE/a.txt"
git -C "$DEPLOY_TREE" add a.txt
git -C "$DEPLOY_TREE" commit -qm two
R2="$(git -C "$DEPLOY_TREE" rev-parse HEAD)"

# Force git diff itself to fail (distinct from grep finding no match) by
# intercepting only the `-C <tree> diff ...` invocation; everything else
# (including cat-file, used by the fail-closed revision check) passes
# through to the real git.
REALGIT="$(command -v git)"
GITSTUB="${TESTROOT}/gitstub"; mkdir -p "$GITSTUB"
cat > "$GITSTUB/git" <<STUB
#!/usr/bin/env bash
if [ "\$1" = "-C" ] && [ "\$3" = "diff" ]; then
  echo "fatal: forced failure for test" >&2
  exit 128
fi
exec "$REALGIT" "\$@"
STUB
chmod +x "$GITSTUB/git"

if PATH="$GITSTUB:$PATH" gate_blocked_files "$R1" "$R2" >/dev/null 2>&1; then
  bad "a genuine git diff failure must not read as clean"
else
  ok "a genuine git diff failure fails closed"
fi
teardown

printf '\n[test] migration detection and dry run\n'
setup
git -C "$DEPLOY_TREE" init -q
git -C "$DEPLOY_TREE" config user.email t@example.com
git -C "$DEPLOY_TREE" config user.name  Test
mkdir -p "$DEPLOY_TREE"/{app,drizzle}
echo base > "$DEPLOY_TREE/app/page.tsx"
git -C "$DEPLOY_TREE" add -A; git -C "$DEPLOY_TREE" commit -qm base
B="$(git -C "$DEPLOY_TREE" rev-parse HEAD)"
echo x > "$DEPLOY_TREE/app/page.tsx"
git -C "$DEPLOY_TREE" add -A; git -C "$DEPLOY_TREE" commit -qm app
A="$(git -C "$DEPLOY_TREE" rev-parse HEAD)"
echo y > "$DEPLOY_TREE/drizzle/0002_x.sql"
git -C "$DEPLOY_TREE" add -A; git -C "$DEPLOY_TREE" commit -qm mig
M="$(git -C "$DEPLOY_TREE" rev-parse HEAD)"

range_touches_migrations "$B" "$A" && bad "app-only range must not request a backup" \
  || ok "app-only range does not request a backup"
range_touches_migrations "$A" "$M" && ok "range touching drizzle/ requests a backup" \
  || bad "range touching drizzle/ requests a backup"
teardown

printf '\n[test] range_touches_migrations: fails closed on a genuine git diff failure\n'
setup
git -C "$DEPLOY_TREE" init -q
git -C "$DEPLOY_TREE" config user.email t@example.com
git -C "$DEPLOY_TREE" config user.name  Test
echo one > "$DEPLOY_TREE/a.txt"
git -C "$DEPLOY_TREE" add a.txt; git -C "$DEPLOY_TREE" commit -qm one
R1="$(git -C "$DEPLOY_TREE" rev-parse HEAD)"
echo two > "$DEPLOY_TREE/a.txt"
git -C "$DEPLOY_TREE" add a.txt; git -C "$DEPLOY_TREE" commit -qm two
R2="$(git -C "$DEPLOY_TREE" rev-parse HEAD)"

# Force `git diff` (specifically) to fail, distinct from grep finding no
# match, the same way the infra-gate git-diff-failure test above does.
REALGIT="$(command -v git)"
GITSTUB="${TESTROOT}/gitstub-mig"; mkdir -p "$GITSTUB"
cat > "$GITSTUB/git" <<STUB
#!/usr/bin/env bash
if [ "\$1" = "-C" ] && [ "\$3" = "diff" ]; then
  echo "fatal: forced failure for test" >&2
  exit 128
fi
exec "$REALGIT" "\$@"
STUB
chmod +x "$GITSTUB/git"

if PATH="$GITSTUB:$PATH" range_touches_migrations "$R1" "$R2"; then
  ok "a git diff failure fails closed toward 'might touch migrations' (triggers backup+migrate)"
else
  bad "a git diff failure fails closed toward 'might touch migrations' (triggers backup+migrate)"
fi
teardown

# --- do_deploy stub harness -------------------------------------------------
# Real git repo, because checkout and diff need real git behaviour. docker,
# curl, deploy.sh, and backup.sh are stubs on PATH (or dropped straight into
# DEPLOY_TREE/infra/scripts, since do_deploy invokes them by absolute path)
# that log every call to CALL_LOG and whose outcome is controlled by env
# vars — the real deploy.sh/backup.sh/docker are never invoked.
setup_deploy_fixture() {
  setup
  git -C "$DEPLOY_TREE" init -q
  git -C "$DEPLOY_TREE" config user.email t@example.com
  git -C "$DEPLOY_TREE" config user.name  Test
  mkdir -p "$DEPLOY_TREE"/{app,drizzle,infra/scripts}
  echo base > "$DEPLOY_TREE/app/page.tsx"
  git -C "$DEPLOY_TREE" add -A; git -C "$DEPLOY_TREE" commit -qm base
  FROM_REV="$(git -C "$DEPLOY_TREE" rev-parse HEAD)"

  CALL_LOG="${TESTROOT}/calls.log"; : > "$CALL_LOG"
  export CALL_LOG

  cat > "$DEPLOY_TREE/infra/scripts/deploy.sh" <<'STUB'
#!/usr/bin/env bash
echo "deploy.sh $*" >> "$CALL_LOG"
[ "${STUB_DEPLOY_FAIL:-0}" = "1" ] && exit 1
exit 0
STUB
  chmod +x "$DEPLOY_TREE/infra/scripts/deploy.sh"

  cat > "$DEPLOY_TREE/infra/scripts/backup.sh" <<'STUB'
#!/usr/bin/env bash
echo "backup.sh $*" >> "$CALL_LOG"
[ "${STUB_BACKUP_FAIL:-0}" = "1" ] && exit 1
exit 0
STUB
  chmod +x "$DEPLOY_TREE/infra/scripts/backup.sh"

  STUBS="${TESTROOT}/bin"; mkdir -p "$STUBS"
  cat > "$STUBS/docker" <<'STUB'
#!/usr/bin/env bash
echo "docker $*" >> "$CALL_LOG"
case "$1" in
  inspect)
    if [ -n "${STUB_PREV_IMAGE:-}" ]; then echo "$STUB_PREV_IMAGE"; exit 0; fi
    echo "no such object" >&2; exit 1 ;;
  compose)
    [ "${STUB_MIGRATE_FAIL:-0}" = "1" ] && exit 1
    exit 0 ;;
  pull)
    [ "${STUB_PULL_FAIL:-0}" = "1" ] && exit 1
    exit 0 ;;
  tag)
    [ "${STUB_TAG_FAIL:-0}" = "1" ] && exit 1
    exit 0 ;;
  manifest) exit 0 ;;
  *) exit 0 ;;
esac
STUB
  chmod +x "$STUBS/docker"

  # external_check calls curl twice per attempt: a status-code probe (-w
  # '%{http_code}') and, only if that was 200, a body fetch piped to grep.
  # STUB_HEALTH_COUNTER_FILE, if set and containing N > 0, reports unhealthy
  # for the next N status-code probes (decrementing on each) before
  # reporting healthy — lets a test make the Nth external_check attempt (not
  # just every attempt) fail, e.g. "forward check fails, rollback check
  # passes" without needing real retry delays.
  cat > "$STUBS/curl" <<'STUB'
#!/usr/bin/env bash
bad_left=0
if [ -n "${STUB_HEALTH_COUNTER_FILE:-}" ] && [ -f "$STUB_HEALTH_COUNTER_FILE" ]; then
  bad_left="$(cat "$STUB_HEALTH_COUNTER_FILE")"
fi
case "$*" in
  *-w*)
    if [ "$bad_left" -gt 0 ]; then
      printf '000'
      [ -n "${STUB_HEALTH_COUNTER_FILE:-}" ] && echo $((bad_left - 1)) > "$STUB_HEALTH_COUNTER_FILE"
    else
      printf '200'
    fi
    ;;
  *)
    printf '{"status":"healthy"}'
    ;;
esac
exit 0
STUB
  chmod +x "$STUBS/curl"

  PATH="$STUBS:$PATH"; export PATH
  # No real retry delay in tests; scenarios that need a failing attempt use
  # STUB_HEALTH_COUNTER_FILE instead of the timeout/interval loop.
  EXTERNAL_CHECK_INTERVAL=0 EXTERNAL_CHECK_TIMEOUT=0
  export EXTERNAL_CHECK_INTERVAL EXTERNAL_CHECK_TIMEOUT
}

printf '\n[test] do_deploy: migration failure leaves the stack untouched\n'
setup_deploy_fixture
echo y > "$DEPLOY_TREE/drizzle/0002_x.sql"
git -C "$DEPLOY_TREE" add -A; git -C "$DEPLOY_TREE" commit -qm mig
REV="$(git -C "$DEPLOY_TREE" rev-parse HEAD)"
SHORT="$(git -C "$DEPLOY_TREE" rev-parse --short=7 "$REV")"
STUB_MIGRATE_FAIL=1 STUB_PREV_IMAGE=sha256:prev do_deploy "$SHORT" "$REV" "$FROM_REV"
rc=$?
is "$rc" "1" "do_deploy returns non-zero when migration fails"
is "$(state_get last_outcome)" "failed: migration (stack untouched)" \
  "migration failure records the stack-untouched outcome"
is "$(grep -c 'backup.sh' "$CALL_LOG")" "1" "backup ran before the migration (range touches drizzle/)"
is "$(grep -c 'docker pull' "$CALL_LOG")" "0" "no image pull after a migration failure — stack untouched"
is "$(grep -c 'deploy.sh' "$CALL_LOG")" "0" "deploy.sh never runs after a migration failure — stack untouched"
teardown

printf '\n[test] do_deploy: verify failure triggers a rollback (rolled back and verified)\n'
setup_deploy_fixture
echo app > "$DEPLOY_TREE/app/page.tsx"
git -C "$DEPLOY_TREE" add -A; git -C "$DEPLOY_TREE" commit -qm app
REV="$(git -C "$DEPLOY_TREE" rev-parse HEAD)"
SHORT="$(git -C "$DEPLOY_TREE" rev-parse --short=7 "$REV")"
COUNTER="${TESTROOT}/health_counter"; echo 1 > "$COUNTER"
STUB_PREV_IMAGE=sha256:prev STUB_HEALTH_COUNTER_FILE="$COUNTER" do_deploy "$SHORT" "$REV" "$FROM_REV"
rc=$?
is "$rc" "1" "do_deploy returns non-zero even when the rollback itself succeeds"
case "$(state_get last_outcome)" in
  "rolled back and verified: ${SHORT} at "*) ok "a failed verification rolls back and records verification of the rollback" ;;
  *) bad "a failed verification rolls back and records verification of the rollback (got '$(state_get last_outcome)')" ;;
esac
is "$(grep -c 'deploy.sh --no-pull' "$CALL_LOG")" "2" "deploy.sh runs once forward and once for the rollback"
teardown

printf '\n[test] do_deploy: rollback after a successful migration needs a human\n'
setup_deploy_fixture
echo y > "$DEPLOY_TREE/drizzle/0002_x.sql"
git -C "$DEPLOY_TREE" add -A; git -C "$DEPLOY_TREE" commit -qm mig
REV="$(git -C "$DEPLOY_TREE" rev-parse HEAD)"
SHORT="$(git -C "$DEPLOY_TREE" rev-parse --short=7 "$REV")"
COUNTER="${TESTROOT}/health_counter"; echo 1 > "$COUNTER"
STUB_PREV_IMAGE=sha256:prev STUB_HEALTH_COUNTER_FILE="$COUNTER" do_deploy "$SHORT" "$REV" "$FROM_REV"
rc=$?
is "$rc" "1" "do_deploy returns non-zero after a post-migration rollback"
case "$(state_get last_outcome)" in
  *"MIGRATION ALREADY APPLIED, needs a human"*)
    ok "a rollback after a successful migration says plainly that the schema was not reverted" ;;
  *)
    bad "a rollback after a successful migration says plainly that the schema was not reverted (got '$(state_get last_outcome)')" ;;
esac
case "$(state_get last_outcome)" in
  "rolled back and verified:"*) ok "the image rollback itself is still reported as verified" ;;
  *) bad "the image rollback itself is still reported as verified (got '$(state_get last_outcome)')" ;;
esac
teardown

printf '\n[test] do_deploy: no previous image means no rollback is possible\n'
setup_deploy_fixture
echo app2 > "$DEPLOY_TREE/app/page.tsx"
git -C "$DEPLOY_TREE" add -A; git -C "$DEPLOY_TREE" commit -qm app2
REV="$(git -C "$DEPLOY_TREE" rev-parse HEAD)"
SHORT="$(git -C "$DEPLOY_TREE" rev-parse --short=7 "$REV")"
COUNTER="${TESTROOT}/health_counter"; echo 1 > "$COUNTER"
unset STUB_PREV_IMAGE
STUB_HEALTH_COUNTER_FILE="$COUNTER" do_deploy "$SHORT" "$REV" "$FROM_REV"
rc=$?
is "$rc" "1" "do_deploy returns non-zero when there is nothing to roll back to"
case "$(state_get last_outcome)" in
  "NO ROLLBACK POSSIBLE"*) ok "an unknown previous image is never reported as a completed rollback" ;;
  *) bad "an unknown previous image is never reported as a completed rollback (got '$(state_get last_outcome)')" ;;
esac
is "$(grep -c 'docker tag' "$CALL_LOG")" "1" "only the forward tag runs — no rollback tag attempt without a previous image"
teardown

printf '\n[test] set -e safety: guarded failures are recorded, not fatal\n'
setup_deploy_fixture
# The real script runs under `set -euo pipefail`; the test harness disabled
# -e after sourcing so it can report every assertion. Re-enable it in a
# subshell here to reproduce the actual production condition these guards
# exist for: a bare (unguarded) failing command would abort mid-do_deploy
# under set -e, skipping both the rollback branch and every state_set below
# it, per the CRITICAL finding in fix round 1.
(
  set -euo pipefail
  do_deploy "deadbee" "0000000000000000000000000000000000000000" "$FROM_REV"
)
rc=$?
is "$rc" "1" "checking out an unknown revision fails the deploy, not the whole process"
is "$(state_get last_outcome)" "failed: checkout 0000000000000000000000000000000000000000 (stack untouched)" \
  "a checkout failure is recorded even under set -e"

echo app3 > "$DEPLOY_TREE/app/page.tsx"
git -C "$DEPLOY_TREE" add -A; git -C "$DEPLOY_TREE" commit -qm app3
REV3="$(git -C "$DEPLOY_TREE" rev-parse HEAD)"
SHORT3="$(git -C "$DEPLOY_TREE" rev-parse --short=7 "$REV3")"
(
  set -euo pipefail
  STUB_TAG_FAIL=1 do_deploy "$SHORT3" "$REV3" "$FROM_REV"
)
rc=$?
is "$rc" "1" "a forward tag failure fails the deploy, not the whole process"
is "$(state_get last_outcome)" "failed: tag (stack untouched)" \
  "a forward tag failure is recorded even under set -e"
teardown

printf '\n[test] main: a stale block clears once the running revision catches up\n'
setup
ORIGIN="${TESTROOT}/origin.git"
git init -q --bare "$ORIGIN"
git -C "$DEPLOY_TREE" init -q
git -C "$DEPLOY_TREE" config user.email t@example.com
git -C "$DEPLOY_TREE" config user.name  Test
git -C "$DEPLOY_TREE" remote add origin "$ORIGIN"
mkdir -p "$DEPLOY_TREE/app"
echo base > "$DEPLOY_TREE/app/page.tsx"
git -C "$DEPLOY_TREE" add -A; git -C "$DEPLOY_TREE" commit -qm base
git -C "$DEPLOY_TREE" push -q origin HEAD:main
BLOCKED_REV="$(git -C "$DEPLOY_TREE" rev-parse HEAD)"
BLOCKED_SHORT="$(git -C "$DEPLOY_TREE" rev-parse --short=7 "$BLOCKED_REV")"

state_set blocked_rev "$BLOCKED_REV"
state_set blocked_short "$BLOCKED_SHORT"
state_set blocked_files "infra/docker-compose.yml"

# A human hand-deployed the previously blocked commit: the container is now
# running it, even though this script never saw a clean range for it.
STUBS="${TESTROOT}/bin"; mkdir -p "$STUBS"
cat > "$STUBS/docker" <<STUB
#!/usr/bin/env bash
if [ "\$1" = "inspect" ]; then echo "$BLOCKED_REV"; exit 0; fi
exit 0
STUB
chmod +x "$STUBS/docker"

( PATH="$STUBS:$PATH"; export PATH; main )
is "$(state_get blocked_rev)" "" "blocked_rev clears once the running revision matches (or is past) it"
is "$(state_get blocked_files)" "" "blocked_files clears along with blocked_rev"
teardown

printf '\n[test] summary\n'
printf '  %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
