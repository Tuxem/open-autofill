#!/bin/bash
# Build script for Open Autofill extension
# Uses Docker to generate browser-specific packages in dist/

set -e

# Load credentials from .env if present
if [ -f "$(dirname "$0")/.env" ]; then
  set -o allexport
  source "$(dirname "$0")/.env"
  set +o allexport
fi

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

# Package Firefox extension as .zip (required by Firefox 150+)
(cd dist/firefox && zip -qr ../open-autofill-firefox.zip .)

# Sign the Firefox extension via AMO API (requires WEB_EXT_API_KEY + WEB_EXT_API_SECRET)
if [ -n "$WEB_EXT_API_KEY" ] && [ -n "$WEB_EXT_API_SECRET" ]; then
  echo "Signing Firefox extension..."
  npx web-ext sign \
    --source-dir dist/firefox \
    --api-key "$WEB_EXT_API_KEY" \
    --api-secret "$WEB_EXT_API_SECRET" \
    --channel unlisted \
    --artifacts-dir dist/
  echo "  ✓ Signed .xpi available in dist/"
else
  echo ""
  echo "Note: Set WEB_EXT_API_KEY and WEB_EXT_API_SECRET to sign the extension."
  echo "      Get credentials at: https://addons.mozilla.org/developers/addon/api/key/"
fi

echo ""
echo "Build complete!"
echo "  dist/open-autofill-firefox.zip  — Load as temporary add-on in Firefox (about:debugging)"
echo "  dist/*.xpi                      — Signed extension (if credentials were set)"
echo "  dist/chrome/                    — Load as unpacked extension in Chrome"
