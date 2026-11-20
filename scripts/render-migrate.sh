#!/usr/bin/env sh
# Apply Prisma migrations using DATABASE_URL (Supabase session pooler, IPv4).
# Run explicitly — not from compile.sh, build, or start:prod.
# Render: set preDeployCommand to "npm run render:migrate" or run manually before/after deploy.
set -eu
cd "$(dirname "$0")/.."

trim() {
  printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
    -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

migrate_url="$(trim "${MIGRATE_DATABASE_URL:-${DATABASE_URL:-}}")"

[ -n "$migrate_url" ] || {
  echo "ERROR: Set DATABASE_URL (session pooler) or MIGRATE_DATABASE_URL before migrate." >&2
  exit 1
}

case "$migrate_url" in
  postgresql://*|postgres://*) ;;
  *)
    echo "ERROR: Migrate URL must start with postgresql://" >&2
    exit 1
    ;;
esac

case "$migrate_url" in
  *YOUR_PASSWORD*)
    echo "ERROR: Migrate URL still contains placeholder YOUR_PASSWORD." >&2
    exit 1
    ;;
esac

if printf '%s' "$migrate_url" | grep -q '@db\.' && ! printf '%s' "$migrate_url" | grep -q 'pooler.supabase.com'; then
  echo "WARN: db.* direct host is often IPv6-only — use session pooler (postgres.PROJECT_REF @ pooler:5432)."
  echo "      Override with MIGRATE_DATABASE_URL if you intentionally use direct from an IPv6-capable host."
fi

if printf '%s' "$migrate_url" | grep -q 'pooler.supabase.com'; then
  if printf '%s' "$migrate_url" | grep -qv 'postgres\.'; then
    echo "ERROR: Pooler migrate URL username must be postgres.PROJECT_REF" >&2
    exit 1
  fi
fi

echo "Applying Prisma migrations (session pooler / MIGRATE_DATABASE_URL)..."
env DATABASE_URL="$migrate_url" npx prisma migrate deploy