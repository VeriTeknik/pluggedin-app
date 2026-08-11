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

printf '\n[test] summary\n'
printf '  %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
