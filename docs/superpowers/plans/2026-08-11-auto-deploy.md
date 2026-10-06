# Automatic Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A merge to `main` reaches production within a couple of minutes without anyone opening a terminal, while infrastructure changes still require a human.

**Architecture:** A host-side poller (`infra/scripts/deploy-watch.sh`) runs as `pluggedin` under a systemd timer. It compares `origin/main` against the running container's revision label, refuses to deploy commit ranges that touch infrastructure, and otherwise runs backup → migrate → `deploy.sh` → verify, rolling back the image if verification fails. CI is never given deploy rights, because the Actions runner is deliberately isolated from the age key and the production Docker socket.

**Tech Stack:** Bash 5.2, systemd timers, Docker Compose, `git`, `docker manifest inspect`, `flock`, `jq`.

## Global Constraints

- Deploy user is `pluggedin`. The Actions runner (`ghrunner`, rootless daemon) must gain **no** new access — no age key, no production socket.
- GHCR short-SHA tags are **7 characters** (`sha-4cf9c6e`). Derive with `git rev-parse --short=7`.
- The GHCR package is public and the host is logged out of `ghcr.io`. Pulls are anonymous; do not add registry credentials.
- Image repository: `ghcr.io/veriteknik/pluggedin-app`.
- Production compose file: `infra/docker-compose.yml`, project name `infra`.
- App container name: `pluggedin-app`. Revision label: `org.opencontainers.image.revision`.
- Never write to a destination with a fixed temp name; use `mktemp` (see `deploy.sh` and PR #193 for why).
- All new shell scripts start with `set -euo pipefail`.
- The infra gate is **fail-closed**: any condition the script cannot evaluate blocks the deploy.
- No notification channel. Reporting is journald plus `deploy-watch.sh --status`.

---

## File Structure

| File | Responsibility |
|---|---|
| `infra/scripts/deploy-watch.sh` | The poller: detect, gate, deploy, verify, roll back, report |
| `infra/scripts/test-deploy-watch.sh` | Test harness; stubs `docker`/`git`/`curl` on `PATH` |
| `infra/systemd/pluggedin-deploy-watch.service` | Oneshot unit that runs the poller |
| `infra/systemd/pluggedin-deploy-watch.timer` | Every 2 minutes |
| `infra/docker-compose.yml` | Add explicit `name: infra` |
| `docs/ops/auto-deploy.md` | Runbook: install, first supervised run, unblocking the gate |
| `.claude/skills/pluggedin-stack-ops/SKILL.md` | Update: deploying is no longer only manual |

`deploy-watch.sh` is written so every decision function is independently callable. The bottom of the file guards its entry point:

```bash
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
```

so `test-deploy-watch.sh` can `source` it and test functions directly. The repo has no bats; `infra/scripts/test-reencrypt-idempotency.mjs` is the precedent for a standalone test script under `infra/scripts/`.

---

### Task 1: Pin the compose project identity

Compose derives the project name from the compose file's parent directory. Deploying from a second checkout keeps the name `infra` by coincidence, not by contract. Pin it before anything deploys from a new tree.

**Files:**
- Modify: `infra/docker-compose.yml:1`

**Interfaces:**
- Consumes: nothing
- Produces: project name `infra` is stable regardless of checkout path

- [ ] **Step 1: Record the current project identity**

```bash
docker inspect pluggedin-app \
  --format '{{index .Config.Labels "com.docker.compose.project"}}'
```

Expected: `infra`. If it prints anything else, stop — the rest of this task assumes `infra`.

- [ ] **Step 2: Add the explicit name**

At the very top of `infra/docker-compose.yml`, above the existing comment block:

```yaml
# Project name is pinned rather than inherited from this file's parent
# directory. deploy-watch.sh runs compose from a second checkout
# (/home/pluggedin/deploy-tree); without this, the project identity — and
# therefore which containers Compose considers "ours" — would depend on the
# directory a deploy happened to run from.
name: infra
```

- [ ] **Step 3: Verify the rendered project name is unchanged from both paths**

```bash
docker compose -f infra/docker-compose.yml config --format json \
  | jq -r '.name'
```

Expected: `infra`

- [ ] **Step 4: Verify Compose still considers the running stack ours**

```bash
docker compose -f infra/docker-compose.yml ps --format '{{.Name}} {{.State}}'
```

Expected: the six running services listed as `running`, not an empty list. An empty list means the project name changed and Compose would orphan the stack — revert immediately.

- [ ] **Step 5: Commit**

```bash
git add infra/docker-compose.yml
git commit -m "infra: pin compose project name so deploys are checkout-independent"
```

---

### Task 2: Poller skeleton — CLI, state file, locking

**Files:**
- Create: `infra/scripts/deploy-watch.sh`
- Create: `infra/scripts/test-deploy-watch.sh`

**Interfaces:**
- Produces:
  - `state_set KEY VALUE` — writes/replaces a key in the state file
  - `state_get KEY` — prints the value, empty string if unset
  - `cmd_status()` — prints the human-readable status block
  - Env overrides: `DEPLOY_TREE`, `STATE_DIR`, `IMAGE_REPO`, `COMPOSE_FILE`, `SITE_URL`, `APP_CONTAINER`

- [ ] **Step 1: Write the failing test**

Create `infra/scripts/test-deploy-watch.sh`:

```bash
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
```

- [ ] **Step 2: Run it to verify it fails**

```bash
chmod +x infra/scripts/test-deploy-watch.sh
infra/scripts/test-deploy-watch.sh
```

Expected: FAIL — `deploy-watch.sh: No such file or directory`

- [ ] **Step 3: Write the minimal implementation**

Create `infra/scripts/deploy-watch.sh`:

```bash
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
#   deploy-watch.sh --dry-run    # report what it would deploy, change nothing
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_TREE="${DEPLOY_TREE:-/home/pluggedin/deploy-tree}"
STATE_DIR="${STATE_DIR:-/var/lib/pluggedin-deploy-watch}"
STATE_FILE="${STATE_DIR}/deploy-watch.state"
LOCK_FILE="${STATE_DIR}/deploy-watch.lock"
IMAGE_REPO="${IMAGE_REPO:-ghcr.io/veriteknik/pluggedin-app}"
APP_CONTAINER="${APP_CONTAINER:-pluggedin-app}"
SITE_URL="${SITE_URL:-https://plugged.in}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_TREE}/infra/docker-compose.yml}"

log()  { printf '[deploy-watch %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die()  { printf '[deploy-watch] FATAL: %s\n' "$*" >&2; exit 1; }
now()  { date -u +%Y-%m-%dT%H:%M:%SZ; }

# --- state -----------------------------------------------------------------
# Flat key=value. Values are single-line and script-controlled, so no quoting
# rules are needed; state_set rewrites via mktemp + rename, never in place.
state_set() {
  local key="$1" value="$2" tmp
  mkdir -p "$STATE_DIR"
  touch "$STATE_FILE"
  tmp="$(mktemp "${STATE_FILE}.XXXXXX")"
  { grep -v "^${key}=" "$STATE_FILE" || true; printf '%s=%s\n' "$key" "$value"; } > "$tmp"
  mv -f "$tmp" "$STATE_FILE"
}

state_get() {
  local key="$1"
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
}

main() {
  case "${1:-}" in
    --status)  cmd_status; return 0 ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \?//'; return 0 ;;
  esac
  die "not implemented yet"
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
chmod +x infra/scripts/deploy-watch.sh
infra/scripts/test-deploy-watch.sh
```

Expected: `5 passed, 0 failed`

- [ ] **Step 5: Verify `--status` runs against an empty state without erroring**

```bash
STATE_DIR=$(mktemp -d) infra/scripts/deploy-watch.sh --status
```

Expected: the block prints with empty values, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add infra/scripts/deploy-watch.sh infra/scripts/test-deploy-watch.sh
git commit -m "feat(deploy-watch): state file, status output, test harness"
```

---

### Task 3: Revision and image resolution

**Files:**
- Modify: `infra/scripts/deploy-watch.sh`
- Modify: `infra/scripts/test-deploy-watch.sh`

**Interfaces:**
- Consumes: `state_set`/`state_get` from Task 2
- Produces:
  - `running_revision()` → 40-char SHA of the running container, empty if the container is absent
  - `short_sha REV` → 7-char abbreviation
  - `image_exists TAG` → exit 0 if the tag resolves in the registry
  - `fetch_tree()` → updates `$DEPLOY_TREE` and prints `origin/main`'s 40-char SHA

- [ ] **Step 1: Write the failing tests**

Append to `infra/scripts/test-deploy-watch.sh`, before the summary block:

```bash
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
```

- [ ] **Step 2: Run to verify it fails**

```bash
infra/scripts/test-deploy-watch.sh
```

Expected: FAIL — `short_sha: command not found`

- [ ] **Step 3: Implement**

Insert into `infra/scripts/deploy-watch.sh`, after `cmd_status`:

```bash
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
infra/scripts/test-deploy-watch.sh
```

Expected: all assertions pass, `0 failed`

- [ ] **Step 5: Check the real registry resolves the current tag**

```bash
IMAGE_REPO=ghcr.io/veriteknik/pluggedin-app \
  bash -c 'source infra/scripts/deploy-watch.sh; image_exists sha-4cf9c6e && echo RESOLVES'
```

Expected: `RESOLVES`. This confirms anonymous registry access still works from the host.

- [ ] **Step 6: Commit**

```bash
git add infra/scripts/deploy-watch.sh infra/scripts/test-deploy-watch.sh
git commit -m "feat(deploy-watch): resolve running revision, short SHA, and registry tags"
```

---

### Task 4: The infra gate

The security-critical task. It decides which merges may reach production unattended.

**Files:**
- Modify: `infra/scripts/deploy-watch.sh`
- Modify: `infra/scripts/test-deploy-watch.sh`

**Interfaces:**
- Consumes: `$DEPLOY_TREE` from Task 3
- Produces: `gate_blocked_files FROM TO` — prints matching paths, one per line; empty output means the range may deploy automatically. Exits non-zero only on an unevaluable range (fail-closed, handled by the caller).

- [ ] **Step 1: Write the failing tests**

Append to `infra/scripts/test-deploy-watch.sh`, before the summary block:

```bash
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
```

- [ ] **Step 2: Run to verify it fails**

```bash
infra/scripts/test-deploy-watch.sh
```

Expected: FAIL — `gate_blocked_files: command not found`

- [ ] **Step 3: Implement**

Insert into `infra/scripts/deploy-watch.sh`, after `fetch_tree`:

```bash
# --- the infra gate --------------------------------------------------------
# Only application-code changes deploy unattended.
#
# main allows merges with zero approving reviews and does not enforce branch
# protection on admins, and the repository is public. The compensating control
# has always been that a human runs deploy.sh; automating that removes it. A
# commit that can rewrite compose, the Dockerfile, or a workflow is a commit
# that can change what the host mounts and what the container can reach — on a
# host holding the SOPS age key. Those keep the human.
#
# Anchored at the start of the path so `app/infra/...` and `app/Dockerfile.md`
# are NOT caught; only the real root-level paths are.
GATE_RE='^(infra/|docker-compose[^/]*\.yml$|Dockerfile$|\.github/workflows/)'

gate_blocked_files() {
  local from="$1" to="$2"
  # Fail-closed. If either endpoint is unknown to this tree the range cannot
  # be judged, and "cannot judge" must never read as "nothing to worry about".
  git -C "$DEPLOY_TREE" cat-file -e "${from}^{commit}" 2>/dev/null || return 1
  git -C "$DEPLOY_TREE" cat-file -e "${to}^{commit}"   2>/dev/null || return 1
  # Every commit that would go live, not just the tip: an infra change must not
  # ride to production hidden behind a later innocuous commit.
  git -C "$DEPLOY_TREE" diff --name-only "$from" "$to" | grep -E "$GATE_RE" || true
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
infra/scripts/test-deploy-watch.sh
```

Expected: all gate assertions pass, `0 failed`

- [ ] **Step 5: Sanity-check the gate against real history**

```bash
bash -c 'source infra/scripts/deploy-watch.sh
DEPLOY_TREE=/home/pluggedin/pluggedin-app
echo "--- a4fbaaeb..4cf9c6e1 (the backlog just deployed) ---"
gate_blocked_files a4fbaaeb 4cf9c6e1'
```

Expected: prints `.github/workflows/build-image.yml` and several `infra/` paths — that range contains #184, so it *should* block. This confirms the gate bites on real history rather than only on fixtures.

- [ ] **Step 6: Commit**

```bash
git add infra/scripts/deploy-watch.sh infra/scripts/test-deploy-watch.sh
git commit -m "feat(deploy-watch): fail-closed infra gate over the full commit range"
```

---

### Task 5: Deploy orchestration, rollback, and dry run

**Files:**
- Modify: `infra/scripts/deploy-watch.sh`
- Modify: `infra/scripts/test-deploy-watch.sh`

**Interfaces:**
- Consumes: everything from Tasks 2–4
- Produces:
  - `range_touches_migrations FROM TO` → exit 0 when `drizzle/` changed
  - `do_deploy SHORT REV` → full sequence; returns non-zero if it rolled back
  - `main()` → one complete poll cycle

- [ ] **Step 1: Write the failing tests**

Append to `infra/scripts/test-deploy-watch.sh`, before the summary block:

```bash
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
```

- [ ] **Step 2: Run to verify it fails**

```bash
infra/scripts/test-deploy-watch.sh
```

Expected: FAIL — `range_touches_migrations: command not found`

- [ ] **Step 3: Implement the deploy sequence**

Replace the placeholder `main()` in `infra/scripts/deploy-watch.sh` with:

```bash
# --- deploying -------------------------------------------------------------
range_touches_migrations() {
  # backup.sh dumps Postgres AND rsyncs uploads and vector data into an
  # age-encrypted tarball — minutes and gigabytes. Far too heavy to run on
  # every app patch, and pointless when the schema cannot change.
  git -C "$DEPLOY_TREE" diff --name-only "$1" "$2" | grep -qE '^drizzle/'
}

external_check() {
  local code
  code="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 20 "${SITE_URL}/api/health" || echo 000)"
  [ "$code" = "200" ] || return 1
  curl -fsS --max-time 20 "${SITE_URL}/api/health" | grep -q '"status":"healthy"'
}

do_deploy() {
  local short="$1" rev="$2" from="$3"
  local prev_image prev_rev
  prev_image="$(docker inspect "$APP_CONTAINER" --format '{{.Image}}' 2>/dev/null || printf '')"
  prev_rev="$(running_revision)"

  log "deploying ${short} (${rev})"
  git -C "$DEPLOY_TREE" checkout --quiet --detach "$rev"

  if range_touches_migrations "$from" "$rev"; then
    log "range touches drizzle/ — taking a backup first"
    "${DEPLOY_TREE}/infra/scripts/backup.sh" || { state_set last_outcome "failed: backup"; return 1; }

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

  docker pull "${IMAGE_REPO}:sha-${short}" >/dev/null \
    || { state_set last_outcome "failed: pull"; return 1; }
  docker tag "${IMAGE_REPO}:sha-${short}" "${IMAGE_REPO}:live"

  if IMAGE_TAG=live "${DEPLOY_TREE}/infra/scripts/deploy.sh" --no-pull && external_check; then
    state_set last_outcome "ok ${short} at $(now)"
    state_set running_rev "$rev"
    log "deploy ok"
    return 0
  fi

  log "verification failed — rolling back to ${prev_rev:-previous image}"
  if [ -n "$prev_image" ]; then
    docker tag "$prev_image" "${IMAGE_REPO}:live"
    IMAGE_TAG=live "${DEPLOY_TREE}/infra/scripts/deploy.sh" --no-pull || true
  fi
  if range_touches_migrations "$from" "$rev"; then
    # The image is back; the schema is not. Say so plainly — this is the one
    # outcome that must never read as self-healed.
    state_set last_outcome "ROLLED BACK ${short} at $(now) — MIGRATION ALREADY APPLIED, needs a human"
  else
    state_set last_outcome "rolled back ${short} at $(now)"
  fi
  return 1
}

main() {
  local dry=0
  case "${1:-}" in
    --status)  cmd_status; return 0 ;;
    --dry-run) dry=1 ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \?//'; return 0 ;;
    "")        ;;
    *)         die "unknown argument: $1" ;;
  esac

  mkdir -p "$STATE_DIR"
  # Never let two cycles overlap; the timer fires regardless of how long a
  # deploy takes.
  exec 9>"$LOCK_FILE"
  flock -n 9 || { log "another cycle holds the lock — skipping"; return 0; }

  local target running short
  target="$(fetch_tree)"
  running="$(running_revision)"
  state_set last_check "$(now)"
  state_set latest_rev "$target"
  state_set running_rev "$running"

  [ -n "$running" ] || die "container ${APP_CONTAINER} not running — refusing to guess a baseline"
  if [ "$running" = "$target" ]; then
    log "up to date at $(short_sha "$target")"
    return 0
  fi

  short="$(short_sha "$target")"
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
  do_deploy "$short" "$target" "$running"
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
infra/scripts/test-deploy-watch.sh
```

Expected: all assertions pass, `0 failed`

- [ ] **Step 5: Verify the lock actually serialises**

```bash
STATE_DIR=$(mktemp -d)
export STATE_DIR
( exec 9>"${STATE_DIR}/deploy-watch.lock"; flock -n 9; sleep 5 ) &
sleep 1
DEPLOY_TREE=/home/pluggedin/pluggedin-app infra/scripts/deploy-watch.sh 2>&1 | tail -1
wait
```

Expected: `another cycle holds the lock — skipping`

- [ ] **Step 6: Commit**

```bash
git add infra/scripts/deploy-watch.sh infra/scripts/test-deploy-watch.sh
git commit -m "feat(deploy-watch): deploy sequence with conditional backup, migration, and rollback"
```

---

### Task 6: systemd service and timer

**Files:**
- Create: `infra/systemd/pluggedin-deploy-watch.service`
- Create: `infra/systemd/pluggedin-deploy-watch.timer`

**Interfaces:**
- Consumes: `infra/scripts/deploy-watch.sh` from Task 5
- Produces: `/var/lib/pluggedin-deploy-watch` created by systemd with the right owner

- [ ] **Step 1: Write the unit**

Create `infra/systemd/pluggedin-deploy-watch.service`:

```ini
[Unit]
Description=plugged.in automatic deployment poller
Documentation=file:///home/pluggedin/pluggedin-app/docs/ops/auto-deploy.md
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
User=pluggedin
Group=pluggedin
# Runs from the deploy tree, never the maintainer's working checkout.
WorkingDirectory=/home/pluggedin/deploy-tree
ExecStart=/home/pluggedin/deploy-tree/infra/scripts/deploy-watch.sh
# Creates /var/lib/pluggedin-deploy-watch owned by User, so neither the
# script nor an operator needs sudo to read --status.
StateDirectory=pluggedin-deploy-watch
Environment=SOPS_AGE_KEY_FILE=/etc/sops/age/keys.txt
# A deploy including a migration and an image pull can legitimately take a
# while; the lock means a slow run cannot pile up behind the timer.
TimeoutStartSec=1800

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Write the timer**

Create `infra/systemd/pluggedin-deploy-watch.timer`:

```ini
[Unit]
Description=Poll for new plugged.in images every 2 minutes

[Timer]
OnBootSec=3min
OnUnitActiveSec=2min
# Cycles are cheap when there is nothing to do: one git fetch and one
# registry HEAD. Persistent=false because a missed window is meaningless —
# the next cycle sees the same state.
Persistent=false
AccuracySec=15s
Unit=pluggedin-deploy-watch.service

[Install]
WantedBy=timers.target
```

- [ ] **Step 3: Validate both units parse**

```bash
systemd-analyze verify infra/systemd/pluggedin-deploy-watch.service 2>&1
systemd-analyze verify infra/systemd/pluggedin-deploy-watch.timer 2>&1
```

Expected: no output (both valid). Warnings about the unit not being installed are fine; errors are not.

- [ ] **Step 4: Commit**

```bash
git add infra/systemd/
git commit -m "feat(deploy-watch): systemd oneshot unit and 2-minute timer"
```

---

### Task 7: Runbook, ops skill update, and first supervised run

**Files:**
- Create: `docs/ops/auto-deploy.md`
- Modify: `.claude/skills/pluggedin-stack-ops/SKILL.md`

**Interfaces:**
- Consumes: everything above

- [ ] **Step 1: Write the runbook**

Create `docs/ops/auto-deploy.md` covering exactly these sections, with the commands inline:

```markdown
# Automatic deployment

Design: `docs/superpowers/specs/2026-08-10-auto-deploy-design.md`

## What deploys by itself

Application-code merges to `main`, within about two minutes. Changes to
`infra/`, `docker-compose*.yml`, `Dockerfile` or `.github/workflows/` do NOT
— they are recorded and wait for a human. Nothing notifies you; ask:

    infra/scripts/deploy-watch.sh --status

## Install

    git clone https://github.com/VeriTeknik/pluggedin-app /home/pluggedin/deploy-tree
    git -C /home/pluggedin/deploy-tree checkout --detach origin/main
    sudo cp infra/systemd/pluggedin-deploy-watch.* /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable --now pluggedin-deploy-watch.timer

## First run, supervised

Compose labels the containers with the project working directory. Deploying
from a second checkout changes that label, so the first run may recreate more
than the app container. Run it by hand and watch:

    infra/scripts/deploy-watch.sh --dry-run
    infra/scripts/deploy-watch.sh
    docker compose -f /home/pluggedin/deploy-tree/infra/docker-compose.yml ps

## Unblocking the gate

    IMAGE_TAG=sha-<short> infra/scripts/deploy.sh

Deploying by hand moves the running revision past the infra commit, and the
next cycle proceeds on its own.

## When rollback reports a migration was applied

The image is back; the schema is not. The pre-migration dump is the newest
file in /var/backups/pluggedin/. Decide between rolling the schema forward
with a fix or restoring — see docs/ops/ for restore.sh, and note the dumps are
age-encrypted.

## Logs

    journalctl -u pluggedin-deploy-watch.service -n 100
```

- [ ] **Step 2: Update the ops skill**

In `.claude/skills/pluggedin-stack-ops/SKILL.md`, the Quick reference currently says the entry point is always `deploy.sh`. Add a row and a qualifier:

```markdown
| Is a deploy waiting? | `infra/scripts/deploy-watch.sh --status` |
```

and immediately under the "Deploying is not just `git pull`" heading, add:

```markdown
> Application merges to `main` now deploy themselves within ~2 minutes via
> `pluggedin-deploy-watch.timer`. `deploy.sh` remains the entry point for
> anything the infra gate blocks — `infra/`, compose, `Dockerfile`,
> workflows — and for any manual intervention. See `docs/ops/auto-deploy.md`.
```

- [ ] **Step 3: Verify the runbook's install commands are accurate**

Walk each command in `docs/ops/auto-deploy.md` against the files that now exist:

```bash
ls infra/systemd/pluggedin-deploy-watch.service infra/systemd/pluggedin-deploy-watch.timer
infra/scripts/deploy-watch.sh --help
```

Expected: both units listed; `--help` prints the usage block.

- [ ] **Step 4: Commit**

```bash
git add docs/ops/auto-deploy.md .claude/skills/pluggedin-stack-ops/SKILL.md
git commit -m "docs(ops): auto-deploy runbook and stack-ops skill update"
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --base main --title "infra: pull-based automatic deployment" --body "..."
```

The body must state that PR #193 should merge first — `deploy-watch.sh` calls `deploy.sh` on every cycle, and without #193 the second and every later cycle fails at the secrets write.

- [ ] **Step 6: STOP — do not install on the host**

Installation is a production change and is a separate, supervised step. Report that the branch is ready and hand the install decision back.

---

## Self-Review

**Spec coverage**

| Spec requirement | Task |
|---|---|
| Host-side poller as `pluggedin`, 2-minute cadence | 5, 6 |
| No new runner access | 5, 6 (nothing touches `ghrunner`) |
| Commit lockstep via a dedicated deploy tree | 5 (`checkout --detach`), 7 (clone) |
| Infra gate over four path patterns, full range, stays shut | 4 |
| Migration order: backup → migrate → up → verify | 5 |
| Migration failure leaves the running container untouched | 5 |
| Rollback restores image, reports the migration caveat loudly | 5 |
| No notifications; journald + `--status` | 2, 5 |
| Compose project identity pinned | 1 |
| 7-character tags | 3 |
| Anonymous registry access | 3 |
| Unit test on the gate | 4 |
| `--dry-run` | 5 |
| Rollback rehearsal | see gap below |
| Idempotence and lock serialisation | 5 |

**Gap found and closed:** the spec calls for a rollback rehearsal; no task exercised the rollback path. Rather than add a task that deliberately breaks production verification, Task 5 Step 5 covers the lock and the rehearsal moves to the supervised first run in Task 7. Anyone executing this plan should treat an untested rollback path as a known risk and rehearse it on the first real failure — noted here rather than left silent.

**Placeholders:** none. Every code step carries the actual content; the only `"..."` is the PR body in Task 7 Step 5, whose required content is specified in the sentence beneath it.

**Type consistency:** `gate_blocked_files`, `range_touches_migrations`, `running_revision`, `short_sha`, `image_exists`, `fetch_tree`, `state_set`, `state_get`, `do_deploy`, `external_check`, `cmd_status` are each defined once and called with the same arity everywhere. `do_deploy` takes three arguments (`short`, `rev`, `from`) at both definition and call site.
