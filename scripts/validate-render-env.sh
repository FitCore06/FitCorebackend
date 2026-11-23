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

if printf '%s' "$DATABASE_URL" | grep -q '\.neon\.tech'; then
  if printf '%s' "$DATABASE_URL" | grep -qv '\-pooler\.'; then
    echo "WARN: Neon runtime should use the *-pooler* hostname — direct ep-* opens too many server connections."
  fi
  if printf '%s' "$DATABASE_URL" | grep -qv 'connection_limit='; then
    echo "WARN: Neon DATABASE_URL missing connection_limit — API will default to 5 in production main.ts."
  fi
fi

if printf '%s' "$DATABASE_URL" | grep -q 'pooler.supabase.com'; then
  if printf '%s' "$DATABASE_URL" | grep -qv 'postgres\.'; then
    fail "DATABASE_URL uses pooler but username must be postgres.PROJECT_REF"
  fi
  if printf '%s' "$DATABASE_URL" | grep -q ':5432/'; then
  if printf '%s' "$DATABASE_URL" | grep -qv 'connection_limit='; then
    echo "WARN: Session pooler (5432) without connection_limit — Supabase EMAXCONNSESSION (pool_size~15) can crash Nest on startup."
    echo "      Add &connection_limit=3..5, or use transaction pooler :6543 with pgbouncer=true."
  fi
  fi
fi

# DIRECT_DATABASE_URL optional on Render (db.* is IPv6-only). Local dev only if needed.
if [ -n "${DIRECT_DATABASE_URL:-}" ]; then
  check_url "DIRECT_DATABASE_URL" "$DIRECT_DATABASE_URL"
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

cors="$(trim "${CORS_ORIGINS:-}")"
if [ -z "$cors" ]; then
  echo "WARN: CORS_ORIGINS is empty — browsers will only allow http://localhost:3000 (see main.ts default)."
elif printf '%s' "$cors" | grep -qv 'vercel.app'; then
  echo "WARN: CORS_ORIGINS has no *.vercel.app entry — member/admin web on Vercel will fail login preflight."
fi

app_url="$(trim "${APP_PUBLIC_URL:-}")"
if [ -n "$app_url" ]; then
  echo "NOTE: APP_PUBLIC_URL=$app_url is also merged into CORS allowlist at runtime."
fi

echo "OK: Render database env looks valid."