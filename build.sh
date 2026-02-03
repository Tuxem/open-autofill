#!/bin/bash
# Build script for Open Autofill extension

set -e

echo "Building Open Autofill..."

# Check if Docker is available
if command -v docker &> /dev/null; then
    echo "Using Docker build..."

    # Build and export CSS
    DOCKER_BUILDKIT=1 docker build --target export --output type=local,dest=. .

    echo "✓ CSS built successfully"
else
    # Fallback to npm
    echo "Docker not found, using npm..."

    if ! command -v npm &> /dev/null; then
        echo "Error: Neither Docker nor npm found. Please install one of them."
        exit 1
    fi

    npm install
    npm run build:css

    echo "✓ CSS built successfully"
fi

echo "Build complete!"
