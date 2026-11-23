#!/usr/bin/env bash
# Runs ON Oracle VM: Node tarball + prebuilt linux bundle (no npm ci on VM).
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/athra/api}"
BUNDLE="${BUNDLE:-/tmp/athra-api-linux-amd64.tar.gz}"
NODE_VER="${NODE_VER:-22.14.0}"
NODE_ROOT="${NODE_ROOT:-$HOME/.local/node}"

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

install_node_if_needed() {
  if [ -x "$NODE_ROOT/bin/node" ]; then
    return
  fi
  echo "==> node ${NODE_VER}"
  mkdir -p "$NODE_ROOT"
  command -v curl >/dev/null 2>&1 || { echo "ERROR: curl required" >&2; exit 1; }
  arch="$(uname -m)"
  case "$arch" in
    x86_64) node_arch=linux-x64 ;;
    aarch64) node_arch=linux-arm64 ;;
    *) echo "ERROR: unsupported arch: $arch" >&2; exit 1 ;;
  esac
  curl -fsSL "https://nodejs.org/dist/v${NODE_VER}/node-v${NODE_VER}-${node_arch}.tar.xz" \
    | tar -xJ -C "$NODE_ROOT" --strip-components=1
}

install_node_if_needed
export PATH="$NODE_ROOT/bin:$PATH"

[ -f "$BUNDLE" ] || { echo "ERROR: missing bundle $BUNDLE" >&2; exit 1; }

mkdir -p "$APP_DIR"
tar -xzf "$BUNDLE" -C "$APP_DIR"

if [ -x "$APP_DIR/node_modules/.bin/prisma" ]; then
  ( cd "$APP_DIR" && ./node_modules/.bin/prisma generate )
  migrate_url="${MIGRATE_DATABASE_URL:-$DATABASE_URL}"
  if [ -n "$migrate_url" ]; then
    echo "==> prisma migrate deploy (from VM)"
    attempt=1
    while [ "$attempt" -le 6 ]; do
      if ( cd "$APP_DIR" && DATABASE_URL="$migrate_url" ./node_modules/.bin/prisma migrate deploy ); then
        break
      fi
      if [ "$attempt" -eq 6 ]; then
        echo "ERROR: prisma migrate deploy failed after 6 attempts" >&2
        exit 1
      fi
      echo "migrate retry ${attempt}/6 in 15s..."
      sleep 15
      attempt=$((attempt + 1))
    done
  fi
fi

ENV_FILE="$APP_DIR/.env"
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
chmod 600 "$ENV_FILE"

SERVICE_DIR="$HOME/.config/systemd/user"
mkdir -p "$SERVICE_DIR"
NODE_BIN="$NODE_ROOT/bin/node"

cat >"$SERVICE_DIR/athra-api.service" <<UNIT
[Unit]
Description=Athra API
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
Environment=NODE_OPTIONS=--experimental-require-module
ExecStart=${NODE_BIN} dist/main.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
UNIT

sudo loginctl enable-linger "$USER" 2>/dev/null || true
systemctl --user daemon-reload
systemctl --user enable athra-api.service
systemctl --user restart athra-api.service

health_url="http://127.0.0.1:${PORT}/api/v1/health"
attempt=1
max_attempts=15
while [ "$attempt" -le "$max_attempts" ]; do
  if curl -fsS --max-time 5 "$health_url" 2>/dev/null; then
    echo ""
    echo "OK: deployed on port ${PORT}"
    exit 0
  fi
  echo "health wait ${attempt}/${max_attempts}..."
  sleep 3
  attempt=$((attempt + 1))
done

echo "ERROR: API not healthy at ${health_url}" >&2
echo "==> systemctl --user status athra-api" >&2
systemctl --user status athra-api --no-pager -l >&2 || true
echo "==> journalctl (last 80 lines)" >&2
journalctl --user -u athra-api -n 80 --no-pager >&2 || true
exit 1
