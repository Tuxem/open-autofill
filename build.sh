#!/bin/bash
# Build script for Open Autofill extension
# Uses Docker to generate browser-specific packages in dist/

set -e

echo "Building Open Autofill with Docker..."

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed or not in PATH."
    exit 1
fi

# Build the image
docker build --target builder -t open-autofill-build .

# Extract dist/ from the container
CONTAINER_ID=$(docker create open-autofill-build)
rm -rf dist
docker cp "$CONTAINER_ID:/app/dist" ./dist
docker rm "$CONTAINER_ID" > /dev/null
docker rmi open-autofill-build > /dev/null

echo ""
echo "Build complete!"
echo "  dist/firefox/  — Load as temporary add-on in Firefox"
echo "  dist/chrome/   — Load as unpacked extension in Chrome"
