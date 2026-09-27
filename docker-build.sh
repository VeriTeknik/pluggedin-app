#!/bin/bash

# Docker multi-architecture build and push script for Plugged.in
# Supports both ARM64 and x86/AMD64 architectures
#
# Usage: ./docker-build.sh [version] [--local]
# Example: ./docker-build.sh v2.16.0
# Example (local build): ./docker-build.sh v2.16.0 --local
#
# Publishing (no --local) builds from a clean `git archive` of HEAD, never
# from the working tree: .gitignore does not filter a Docker build context, so
# a checkout holding a configured .env, uploads or local dumps would otherwise
# ship them to everyone who can pull the image. The working tree must have no
# uncommitted changes to tracked files, so what is published is exactly HEAD.
# --local builds use the working tree (.dockerignore still applies) and only
# load the result into the local daemon.
#
# Expected build times:
#   - Local build (single arch): 5-10 minutes
#   - Multi-arch build: 15-25 minutes (includes QEMU emulation)
#
# Rollback strategy:
#   If a build fails, previous tags remain unchanged on Docker Hub.
#   To rollback: docker pull veriteknik/pluggedin:<previous-version>

set -euo pipefail

die() { echo "❌ Error: $*" >&2; exit 1; }

# Configuration
DOCKER_USERNAME=${DOCKER_USERNAME:-"veriteknik"}
IMAGE_NAME="pluggedin"
VERSION=${1:-"latest"}
LOCAL_BUILD=${2:-""}
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Platform configuration
PLATFORMS="linux/amd64,linux/arm64"

# A tag is interpolated into image references below; hold it to Docker's own
# tag grammar rather than trusting whatever was typed.
[[ "$VERSION" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] \
    || die "invalid version/tag '$VERSION'"
# An unrecognised second argument used to fall through to the multi-arch
# PUSH branch, so a typo such as `--locl` published the image.
case "$LOCAL_BUILD" in
    ""|--local) ;;
    *) die "unknown argument '$LOCAL_BUILD' (expected --local or nothing)" ;;
esac

echo "🐳 Building Plugged.in Docker image..."
echo "Version: $VERSION"
echo "Docker Hub: $DOCKER_USERNAME/$IMAGE_NAME"
echo "Platforms: $PLATFORMS"

# Create or use existing buildx builder
echo "🔧 Setting up Docker buildx..."
if ! docker buildx inspect multiarch-builder > /dev/null 2>&1; then
    echo "Creating new buildx builder instance..."
    docker buildx create --name multiarch-builder --use --bootstrap
else
    echo "Using existing buildx builder..."
    docker buildx use multiarch-builder
fi

# Login to Docker Hub
echo "🔐 Logging in to Docker Hub..."
if ! docker login; then
    echo "❌ Error: Docker login failed"
    exit 1
fi
echo "✅ Successfully logged in to Docker Hub"

if [ "$LOCAL_BUILD" == "--local" ]; then
    # Local build and load (single platform only - current architecture)
    echo "📦 Building for local platform only..."

    # Detect platform using docker version for reliability
    DOCKER_ARCH=$(docker version -f '{{.Server.Arch}}')
    DOCKER_OS=$(docker version -f '{{.Server.Os}}')

    if [ -z "$DOCKER_ARCH" ] || [ -z "$DOCKER_OS" ]; then
        echo "❌ Error: Could not detect Docker platform"
        exit 1
    fi

    LOCAL_PLATFORM="$DOCKER_OS/$DOCKER_ARCH"
    echo "Detected platform: $LOCAL_PLATFORM"

    docker buildx build \
        --platform "$LOCAL_PLATFORM" \
        -f "$REPO_ROOT/Dockerfile.production" \
        -t "$DOCKER_USERNAME/$IMAGE_NAME:$VERSION" \
        --load \
        "$REPO_ROOT"

    echo "✅ Successfully built $DOCKER_USERNAME/$IMAGE_NAME:$VERSION for $LOCAL_PLATFORM!"
else
    # Multi-platform build and push, from a clean export of HEAD.
    git -C "$REPO_ROOT" rev-parse --verify --quiet HEAD >/dev/null \
        || die "$REPO_ROOT is not a git checkout with a HEAD commit"
    if [ -n "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=no)" ]; then
        die "uncommitted changes to tracked files; commit or stash them first (publishing builds exactly HEAD)"
    fi
    BUILD_CONTEXT="$(mktemp -d "${TMPDIR:-/tmp}/pluggedin-build.XXXXXX")"
    trap 'rm -rf "$BUILD_CONTEXT"' EXIT
    git -C "$REPO_ROOT" archive --format=tar HEAD | tar -x -C "$BUILD_CONTEXT"
    echo "📦 Building multi-architecture production image from $(git -C "$REPO_ROOT" rev-parse --short HEAD)..."

    # One build carries both tags; it used to be built twice, sending the
    # whole context each time, for the same result.
    TAGS=(-t "$DOCKER_USERNAME/$IMAGE_NAME:$VERSION")
    if [ "$VERSION" != "latest" ]; then
        echo "🏷️  Also tagging and pushing as latest..."
        TAGS+=(-t "$DOCKER_USERNAME/$IMAGE_NAME:latest")
    fi
    docker buildx build \
        --platform "$PLATFORMS" \
        -f "$BUILD_CONTEXT/Dockerfile.production" \
        "${TAGS[@]}" \
        --push \
        "$BUILD_CONTEXT"

    echo "✅ Successfully pushed multi-arch $DOCKER_USERNAME/$IMAGE_NAME:$VERSION to Docker Hub!"

    # Verify manifest was created correctly
    echo ""
    echo "🔍 Verifying multi-arch manifest..."
    if docker buildx imagetools inspect "$DOCKER_USERNAME/$IMAGE_NAME:$VERSION" > /dev/null 2>&1; then
        echo "✅ Manifest verification successful!"
        echo ""
        echo "📋 Image details:"
        docker buildx imagetools inspect "$DOCKER_USERNAME/$IMAGE_NAME:$VERSION" | grep -E "Name:|Platform:"
    else
        echo "⚠️  Warning: Could not verify manifest (image may still be valid)"
    fi
fi

echo ""
echo "📝 To use this image:"
echo "docker pull $DOCKER_USERNAME/$IMAGE_NAME:$VERSION"
echo ""
echo "🚀 To deploy:"
echo "docker-compose -f docker-compose.production.yml up -d"
