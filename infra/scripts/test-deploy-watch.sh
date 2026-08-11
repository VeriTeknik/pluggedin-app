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

printf '\n[test] summary\n'
printf '  %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
