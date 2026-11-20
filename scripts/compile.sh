#!/usr/bin/env sh
# Works when Render runs: npm install (prod only) && npm run build
set -eu
cd "$(dirname "$0")/.."

if [ ! -x node_modules/.bin/nest ]; then
  echo "Dev toolchain missing — installing devDependencies..."
  npm install --include=dev
fi

npx prisma generate
npm exec nest build

# Migrations only on Render — use DIRECT_DATABASE_URL when set (pooler user breaks migrate).
if [ -n "${DATABASE_URL:-}" ] && { [ -n "${RENDER:-}" ] || [ -n "${RENDER_SERVICE_ID:-}" ] || [ "${RUN_DB_MIGRATE:-}" = "1" ]; }; then
  echo "Applying Prisma migrations..."
  if [ -n "${DIRECT_DATABASE_URL:-}" ]; then
  DATABASE_URL="$DIRECT_DATABASE_URL" npx prisma migrate deploy
  else
    npx prisma migrate deploy
  fi
fi