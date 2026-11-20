#!/usr/bin/env sh
# Validates Render env vars before build (run locally: npm run render:env-check)
set -eu

fail() {
  echo "RENDER ENV ERROR: $1" >&2
  exit 1
}

trim() {
  printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
    -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

normalize_db_env() {
  DATABASE_URL="$(trim "${DATABASE_URL:-}")"
  DIRECT_DATABASE_URL="$(trim "${DIRECT_DATABASE_URL:-}")"
  export DATABASE_URL DIRECT_DATABASE_URL
}

check_url() {
  name="$1"
  value="$(trim "$2")"
  [ -n "$value" ] || fail "$name is empty"
  case "$value" in
    postgresql://*|postgres://*) ;;
    *)
      prefix="$(printf '%.24s' "$value")"
      fail "$name must start with postgresql:// — got «${prefix}…». Paste full Supabase URI in Render VALUE box (no extra quotes)."
      ;;
  esac
  case "$value" in
    *YOUR_PASSWORD*) fail "$name still has placeholder YOUR_PASSWORD" ;;
  esac
}

normalize_db_env

check_url "DATABASE_URL" "$DATABASE_URL"

if printf '%s' "$DATABASE_URL" | grep -q 'pooler.supabase.com'; then
  if printf '%s' "$DATABASE_URL" | grep -qv 'postgres\.'; then
    fail "DATABASE_URL uses pooler but username must be postgres.PROJECT_REF"
  fi
  check_url "DIRECT_DATABASE_URL" "$DIRECT_DATABASE_URL"
  if printf '%s' "$DIRECT_DATABASE_URL" | grep -q 'postgres\.'; then
    fail "DIRECT_DATABASE_URL must use user postgres only (not postgres.PROJECT_REF)"
  fi
  if printf '%s' "$DIRECT_DATABASE_URL" | grep -q 'pooler.supabase.com'; then
    fail "DIRECT_DATABASE_URL must be db.*.supabase.co (Direct), not pooler"
  fi
fi

[ -n "${JWT_ACCESS_SECRET:-}" ] || fail "JWT_ACCESS_SECRET is not set"

if [ -z "${NODE_ENV:-}" ]; then
  export NODE_ENV=production
  echo "NOTE: NODE_ENV was unset — defaulting to production for Render build."
fi

if [ -z "${DEV_AUTH_STUB:-}" ]; then
  export DEV_AUTH_STUB=false
  echo "NOTE: DEV_AUTH_STUB was unset — defaulting to false for Render build."
elif [ "${DEV_AUTH_STUB}" != "false" ]; then
  fail "DEV_AUTH_STUB must be false on Render (got: ${DEV_AUTH_STUB})"
fi

echo "OK: Render database env looks valid."