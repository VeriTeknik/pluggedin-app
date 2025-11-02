#!/bin/bash

# Docker multi-architecture build and push script for Plugged.in
# Supports both ARM64 and x86/AMD64 architectures
#
# Usage: ./docker-build.sh [version] [--local]
# Example: ./docker-build.sh v2.16.0
# Example (local build): ./docker-build.sh v2.16.0 --local
#
# Expected build times:
#   - Local build (single arch): 5-10 minutes
#   - Multi-arch build: 15-25 minutes (includes QEMU emulation)
#
# Rollback strategy:
#   If a build fails, previous tags remain unchanged on Docker Hub.
#   To rollback: docker pull veriteknik/pluggedin:<previous-version>

set -e

# Configuration
DOCKER_USERNAME=${DOCKER_USERNAME:-"veriteknik"}
IMAGE_NAME="pluggedin"
VERSION=${1:-"latest"}
LOCAL_BUILD=${2:-""}

# Platform configuration
PLATFORMS="linux/amd64,linux/arm64"

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
        --platform $LOCAL_PLATFORM \
        -f Dockerfile.production \
        -t $DOCKER_USERNAME/$IMAGE_NAME:$VERSION \
        --load \
        .

    echo "✅ Successfully built $DOCKER_USERNAME/$IMAGE_NAME:$VERSION for $LOCAL_PLATFORM!"
else
    # Multi-platform build and push
    echo "📦 Building multi-architecture production image..."
    docker buildx build \
        --platform $PLATFORMS \
        -f Dockerfile.production \
        -t $DOCKER_USERNAME/$IMAGE_NAME:$VERSION \
        --push \
        .

    # Also tag as latest if not already latest
    if [ "$VERSION" != "latest" ]; then
        echo "🏷️  Tagging and pushing as latest..."
        docker buildx build \
            --platform $PLATFORMS \
            -f Dockerfile.production \
            -t $DOCKER_USERNAME/$IMAGE_NAME:latest \
            --push \
            .
    fi

    echo "✅ Successfully pushed multi-arch $DOCKER_USERNAME/$IMAGE_NAME:$VERSION to Docker Hub!"

    # Verify manifest was created correctly
    echo ""
    echo "🔍 Verifying multi-arch manifest..."
    if docker buildx imagetools inspect $DOCKER_USERNAME/$IMAGE_NAME:$VERSION > /dev/null 2>&1; then
        echo "✅ Manifest verification successful!"
        echo ""
        echo "📋 Image details:"
        docker buildx imagetools inspect $DOCKER_USERNAME/$IMAGE_NAME:$VERSION | grep -E "Name:|Platform:"
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