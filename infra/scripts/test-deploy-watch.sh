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

printf '\n[test] summary\n'
printf '  %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
