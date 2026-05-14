#!/usr/bin/env bash
# Build and (optionally) push the pluggedin-app image.
#
# Usage:
#   infra/scripts/build.sh                 # build :latest and :sha-<short>
#   infra/scripts/build.sh --push          # also push to ghcr.io
#   infra/scripts/build.sh --tag v3.4.0    # additional tag, e.g. for a release
#
# CI invokes this with --push. Local invocation defaults to no-push.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE="ghcr.io/veriteknik/pluggedin-app"
SHORT_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"

PUSH=0
EXTRA_TAGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --push) PUSH=1; shift ;;
    --tag)  EXTRA_TAGS+=("$2"); shift 2 ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "build.sh: unknown arg: $1" >&2; exit 2 ;;
  esac
done

ARGS=(buildx build
  --file "${REPO_ROOT}/Dockerfile"
  --platform linux/amd64
  --tag "${IMAGE}:latest"
  --tag "${IMAGE}:sha-${SHORT_SHA}"
  --cache-from "type=registry,ref=${IMAGE}:cache"
  --cache-to   "type=registry,ref=${IMAGE}:cache,mode=max"
)

for t in "${EXTRA_TAGS[@]}"; do
  ARGS+=(--tag "${IMAGE}:${t}")
done

if [ "$PUSH" -eq 1 ]; then
  ARGS+=(--push)
else
  ARGS+=(--load)
fi

ARGS+=("$REPO_ROOT")

echo "[build] docker ${ARGS[*]}"
docker "${ARGS[@]}"
