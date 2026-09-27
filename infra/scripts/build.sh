#!/usr/bin/env bash
# Build and (optionally) push the pluggedin-app image.
#
# Usage:
#   infra/scripts/build.sh                 # build :latest and :sha-<short>
#   infra/scripts/build.sh --push          # also push to ghcr.io
#   infra/scripts/build.sh --tag v3.4.0    # additional tag, e.g. for a release
#
# Local invocation defaults to no-push and exports nothing to the registry.
# --push builds a clean `git archive` of HEAD (tracked changes must be
# committed first) and is the only mode that refreshes the registry cache.
#
# Why: the registry cache is exported with mode=max, which publishes the
# builder's intermediate layers — including the `COPY . .` layer. Exporting it
# from a working-tree build published whatever gitignored files the checkout
# held (.env, uploads, dumps) to anyone with pull access, even without --push.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE="ghcr.io/veriteknik/pluggedin-app"
SHORT_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"

PUSH=0
EXTRA_TAGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --push) PUSH=1; shift ;;
    --tag)
      [ $# -ge 2 ] || { echo "build.sh: --tag needs a value" >&2; exit 2; }
      # Docker's tag grammar; the value is spliced into an image reference.
      [[ "$2" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] \
        || { echo "build.sh: invalid tag: $2" >&2; exit 2; }
      EXTRA_TAGS+=("$2"); shift 2 ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "build.sh: unknown arg: $1" >&2; exit 2 ;;
  esac
done

ARGS=(buildx build
  --platform linux/amd64
  --tag "${IMAGE}:latest"
  --tag "${IMAGE}:sha-${SHORT_SHA}"
  --cache-from "type=registry,ref=${IMAGE}:cache"
)

for t in "${EXTRA_TAGS[@]}"; do
  ARGS+=(--tag "${IMAGE}:${t}")
done

if [ "$PUSH" -eq 1 ]; then
  # Publish exactly HEAD. A clean export cannot carry gitignored files into
  # the image or into the mode=max cache, whatever the checkout holds.
  if [ -n "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=no)" ]; then
    echo "build.sh: uncommitted changes to tracked files; commit or stash them before --push" >&2
    exit 1
  fi
  CONTEXT="$(mktemp -d "${TMPDIR:-/tmp}/pluggedin-app-build.XXXXXX")"
  trap 'rm -rf "$CONTEXT"' EXIT
  git -C "$REPO_ROOT" archive --format=tar HEAD | tar -x -C "$CONTEXT"
  ARGS+=(
    --file "${CONTEXT}/Dockerfile"
    --cache-to "type=registry,ref=${IMAGE}:cache,mode=max"
    --push
  )
else
  # Working-tree build for local use: loaded into the local daemon only, and
  # never exported to the shared registry cache.
  CONTEXT="$REPO_ROOT"
  ARGS+=(--file "${CONTEXT}/Dockerfile" --load)
fi

ARGS+=("$CONTEXT")

echo "[build] docker ${ARGS[*]}"
docker "${ARGS[@]}"
