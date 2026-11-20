#!/usr/bin/env sh
# Works when Render runs: npm install (prod only) && npm run build
set -eu
cd "$(dirname "$0")/.."

if [ -n "${RENDER:-}" ] || [ -n "${RENDER_SERVICE_ID:-}" ]; then
  sh scripts/validate-render-env.sh
fi

if [ ! -x node_modules/.bin/nest ]; then
  echo "Dev toolchain missing — installing devDependencies..."
  npm install --include=dev
fi

npx prisma generate
npm exec nest build