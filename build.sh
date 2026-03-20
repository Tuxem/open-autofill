#!/bin/bash
# Build script for Open Autofill extension
# Generates browser-specific packages in dist/

set -e

echo "Building Open Autofill..."

# Check if Docker is available
if command -v docker &> /dev/null; then
    echo "Using Docker for CSS build..."
    DOCKER_BUILDKIT=1 docker build --target export --output type=local,dest=. .
    echo "✓ CSS built successfully"
else
    echo "Docker not found, using npm..."

    if ! command -v npm &> /dev/null; then
        echo "Error: Neither Docker nor npm found. Please install one of them."
        exit 1
    fi

    npm install
    npm run build:css
    echo "✓ CSS built successfully"
fi

# Generate browser-specific builds
echo "Generating browser builds..."
node scripts/build.js

echo ""
echo "Build complete!"
echo "  dist/firefox/  — Load as temporary add-on in Firefox"
echo "  dist/chrome/   — Load as unpacked extension in Chrome"
