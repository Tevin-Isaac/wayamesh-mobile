#!/usr/bin/env bash
# Build the web wallet and copy it into the Next.js marketing site (wayamesh.xyz).
# Usage: scripts/sync-to-website.sh "/path/to/wayamesh - website"
set -euo pipefail
SITE="${1:?path to the website repo}"
cd "$(dirname "$0")/.."
VITE_BASE=/app-static/ npm run build
rm -rf "$SITE/public/app-static"
mkdir -p "$SITE/public/app-static"
cp -R dist/. "$SITE/public/app-static/"
# The service worker must live at the site root so it can control /app.
mv "$SITE/public/app-static/sw.js" "$SITE/public/sw.js"
echo "Synced wallet into $SITE/public/app-static (+ public/sw.js)"
