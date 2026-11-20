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

if [ -n "${DATABASE_URL:-}" ]; then
  echo "Applying Prisma migrations..."
  npx prisma migrate deploy
fi