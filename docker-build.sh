#!/bin/bash

# Docker build and push script for Plugged.in
# Usage: ./docker-build.sh [version]
# Example: ./docker-build.sh v2.10.3

set -e

# Configuration
DOCKER_USERNAME=${DOCKER_USERNAME:-"veriteknik"}
IMAGE_NAME="pluggedin"
VERSION=${1:-"latest"}

echo "🐳 Building Plugged.in Docker image..."
echo "Version: $VERSION"
echo "Docker Hub: $DOCKER_USERNAME/$IMAGE_NAME"

# Build production image
echo "📦 Building production image..."
docker build -f Dockerfile.production -t $IMAGE_NAME:$VERSION .

# Tag for Docker Hub
echo "🏷️  Tagging image..."
docker tag $IMAGE_NAME:$VERSION $DOCKER_USERNAME/$IMAGE_NAME:$VERSION

if [ "$VERSION" != "latest" ]; then
    docker tag $IMAGE_NAME:$VERSION $DOCKER_USERNAME/$IMAGE_NAME:latest
fi

# Login to Docker Hub
echo "🔐 Logging in to Docker Hub..."
docker login

# Push to Docker Hub
echo "📤 Pushing to Docker Hub..."
docker push $DOCKER_USERNAME/$IMAGE_NAME:$VERSION

if [ "$VERSION" != "latest" ]; then
    docker push $DOCKER_USERNAME/$IMAGE_NAME:latest
fi

echo "✅ Successfully pushed $DOCKER_USERNAME/$IMAGE_NAME:$VERSION to Docker Hub!"
echo ""
echo "📝 To use this image:"
echo "docker pull $DOCKER_USERNAME/$IMAGE_NAME:$VERSION"
echo ""
echo "🚀 To deploy:"
echo "docker-compose -f docker-compose.production.yml up -d"