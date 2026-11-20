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

# Migrations only on Render — prefer DIRECT_DATABASE_URL (not pooler username).
if [ -n "${DATABASE_URL:-}" ] && { [ -n "${RENDER:-}" ] || [ -n "${RENDER_SERVICE_ID:-}" ] || [ "${RUN_DB_MIGRATE:-}" = "1" ]; }; then
  echo "Applying Prisma migrations..."
  migrate_url="${DIRECT_DATABASE_URL:-$DATABASE_URL}"
  case "$migrate_url" in
    postgresql://*|postgres://*) ;;
    *)
      echo "ERROR: Database URL must start with postgresql:// (check DIRECT_DATABASE_URL on Render)."
      echo "Supabase → Connect → Direct connection → copy full URI into DIRECT_DATABASE_URL."
      exit 1
      ;;
  esac
  env DATABASE_URL="$migrate_url" npx prisma migrate deploy
fi