#!/usr/bin/env sh
# Simulates Render: prod npm install + compile (no migrate) + optional runtime smoke.
set -eu
cd "$(dirname "$0")/.."

echo "== 1) Env check (set RENDER=true and export vars like on Render) =="
export RENDER=true
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
sh scripts/validate-render-env.sh

echo "== 2) Clean prod install + build (like Render) =="
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
cp -R . "$tmpdir/fitcore-api"
cd "$tmpdir/fitcore-api"
rm -rf node_modules dist
npm install --omit=dev >/dev/null
export RENDER=true
# shellcheck disable=SC1091
[ -f .env ] && . ./.env
npm run build

echo "== 3) Prod start smoke =="
export DEV_AUTH_STUB="${DEV_AUTH_STUB:-false}"
export PORT=3099
node dist/main.js &
pid=$!
sleep 3
code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3099/api/v1/health || true)"
kill "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null || true

if [ "$code" = "200" ]; then
  echo "OK: health HTTP 200 — safe to redeploy on Render."
else
  echo "WARN: health returned $code (check DATABASE_URL at runtime)."
  exit 1
fi