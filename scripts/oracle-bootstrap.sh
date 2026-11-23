#!/usr/bin/env bash
# Runs ON the Ubuntu VM (Oracle). No secrets in git — env vars must be set before invoke.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/athra/api}"
REPO_URL="${REPO_URL:-https://github.com/FitCore06/FitCorebackend.git}"

require_env() {
  for name in "$@"; do
    if [ -z "${!name:-}" ]; then
      echo "ERROR: missing env $name" >&2
      exit 1
    fi
  done
}

require_env DATABASE_URL JWT_ACCESS_SECRET CORS_ORIGINS

export NODE_ENV=production
export PORT="${PORT:-3001}"
export DEV_AUTH_STUB=false

echo "==> packages"
sudo apt-get update -qq
sudo apt-get install -y -qq git curl build-essential ca-certificates >/dev/null

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi

echo "==> source"
mkdir -p "$(dirname "$APP_DIR")"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

ENV_FILE="$(mktemp)"
chmod 600 "$ENV_FILE"
trap 'shred -u -f "$ENV_FILE" 2>/dev/null || rm -f "$ENV_FILE"' EXIT

{
  echo "NODE_ENV=production"
  echo "PORT=${PORT}"
  echo "DEV_AUTH_STUB=false"
  echo "DATABASE_URL=${DATABASE_URL}"
  echo "JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}"
  echo "CORS_ORIGINS=${CORS_ORIGINS}"
  [ -n "${APP_PUBLIC_URL:-}" ] && echo "APP_PUBLIC_URL=${APP_PUBLIC_URL}"
  [ -n "${FITCORE_AUTOMATION_SECRET:-}" ] && echo "FITCORE_AUTOMATION_SECRET=${FITCORE_AUTOMATION_SECRET}"
  [ -n "${ATHRA_AUTOMATION_SECRET:-}" ] && echo "ATHRA_AUTOMATION_SECRET=${ATHRA_AUTOMATION_SECRET}"
  [ -n "${RAZORPAY_KEY_ID:-}" ] && echo "RAZORPAY_KEY_ID=${RAZORPAY_KEY_ID}"
  [ -n "${RAZORPAY_KEY_SECRET:-}" ] && echo "RAZORPAY_KEY_SECRET=${RAZORPAY_KEY_SECRET}"
  [ -n "${RAZORPAY_WEBHOOK_SECRET:-}" ] && echo "RAZORPAY_WEBHOOK_SECRET=${RAZORPAY_WEBHOOK_SECRET}"
  [ -n "${FITCORE_MEMBERSHIP_EXPIRY_CRON_ENABLED:-}" ] && echo "FITCORE_MEMBERSHIP_EXPIRY_CRON_ENABLED=${FITCORE_MEMBERSHIP_EXPIRY_CRON_ENABLED}"
  [ -n "${FITCORE_GYM_SLUG:-}" ] && echo "FITCORE_GYM_SLUG=${FITCORE_GYM_SLUG}"
  [ -n "${API_THROTTLE_LIMIT:-}" ] && echo "API_THROTTLE_LIMIT=${API_THROTTLE_LIMIT}"
} >"$ENV_FILE"

cp "$ENV_FILE" .env
chmod 600 .env

echo "==> build"
npm ci
npm run build
env $(grep -v '^#' "$ENV_FILE" | xargs) npm run render:migrate

echo "==> pm2"
pm2 delete athra-api 2>/dev/null || true
pm2 start dist/main.js --name athra-api
pm2 save
pm2 startup systemd -u "$USER" --hp "$HOME" 2>/dev/null | tail -1 | bash -s || true

echo "==> local health"
health_url="http://127.0.0.1:${PORT}/api/v1/health"
attempt=1
max_attempts=15
while [ "$attempt" -le "$max_attempts" ]; do
  if curl -fsS --max-time 5 "$health_url" 2>/dev/null; then
    echo ""
    echo "OK: Athra API on port ${PORT}"
    exit 0
  fi
  echo "health wait ${attempt}/${max_attempts}..."
  sleep 3
  attempt=$((attempt + 1))
done

echo "ERROR: API not healthy at ${health_url}" >&2
pm2 status athra-api >&2 || true
pm2 logs athra-api --nostream --lines 80 >&2 || true
exit 1
