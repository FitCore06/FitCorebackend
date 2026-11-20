#!/usr/bin/env sh
# Phase 1: apply Prisma migrations to Supabase (staging).
# Uses Session pooler (IPv4) — direct db.* host is IPv6-only on many networks.
set -eu
cd "$(dirname "$0")/.."

PROJECT_REF="${SUPABASE_PROJECT_REF:-syemwfpinkqeejijrllq}"
POOLER_HOST="${SUPABASE_POOLER_HOST:-aws-1-ap-southeast-2.pooler.supabase.com}"

pw=""
if [ -n "${SUPABASE_DB_PASSWORD:-}" ]; then
  pw="$SUPABASE_DB_PASSWORD"
elif [ -f .supabase-db-password ]; then
  pw="$(cat .supabase-db-password | tr -d '\r\n')"
elif grep '^DATABASE_URL=' .env 2>/dev/null | grep -vq 'YOUR_PASSWORD'; then
  echo "Using DATABASE_URL from .env"
else
  pw="$(osascript -e 'display dialog "Supabase database password:" default answer "" with title "FitCore migrate" with hidden answer buttons {"Cancel", "OK"} default button "OK"' -e 'text returned of result' 2>/dev/null || true)"
  if [ -z "$pw" ]; then
    echo "No password. Set DATABASE_URL in FitCorebackend/.env or run with SUPABASE_DB_PASSWORD=... $0"
    exit 1
  fi
fi

if [ -n "$pw" ]; then
  export DATABASE_URL="postgresql://postgres.${PROJECT_REF}:${pw}@${POOLER_HOST}:5432/postgres?sslmode=require"
fi

echo "Generating Prisma client..."
npm run db:generate

echo "Applying migrations to Supabase (session pooler)..."
npx prisma migrate deploy

echo "Done. Optional: npm run db:seed (staging test users only)."
echo "If using .env for daily dev, update DATABASE_URL to the same pooler URI (password saved locally)."