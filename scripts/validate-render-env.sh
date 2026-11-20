#!/usr/bin/env sh
# Validates Render env vars before build (run locally: npm run render:env-check)
set -eu

fail() {
  echo "RENDER ENV ERROR: $1" >&2
  exit 1
}

check_url() {
  name="$1"
  value="$2"
  [ -n "$value" ] || fail "$name is empty"
  case "$value" in
    postgresql://*|postgres://*) ;;
    *) fail "$name must start with postgresql:// (full URI only, no quotes in Render value)" ;;
  esac
  case "$value" in
    *YOUR_PASSWORD*) fail "$name still has placeholder YOUR_PASSWORD" ;;
  esac
}

check_url "DATABASE_URL" "${DATABASE_URL:-}"

if printf '%s' "$DATABASE_URL" | grep -q 'pooler.supabase.com'; then
  if printf '%s' "$DATABASE_URL" | grep -qv 'postgres\.'; then
    fail "DATABASE_URL uses pooler but username must be postgres.PROJECT_REF"
  fi
  check_url "DIRECT_DATABASE_URL" "${DIRECT_DATABASE_URL:-}"
  if printf '%s' "$DIRECT_DATABASE_URL" | grep -q 'postgres\.'; then
    fail "DIRECT_DATABASE_URL must use user postgres only (not postgres.PROJECT_REF)"
  fi
  if printf '%s' "$DIRECT_DATABASE_URL" | grep -q 'pooler.supabase.com'; then
    fail "DIRECT_DATABASE_URL must be db.*.supabase.co (Direct), not pooler"
  fi
fi

[ -n "${JWT_ACCESS_SECRET:-}" ] || fail "JWT_ACCESS_SECRET is not set"
[ -n "${NODE_ENV:-}" ] || fail "NODE_ENV is not set"
[ "${DEV_AUTH_STUB:-}" = "false" ] || fail "DEV_AUTH_STUB must be false"

echo "OK: Render database env looks valid."