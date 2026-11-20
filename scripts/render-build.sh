#!/usr/bin/env sh
# Optional Render build (same as default npm run build).
set -eu
cd "$(dirname "$0")/.."
npm run build