#!/usr/bin/env bash
# Run on Mac. Secrets only in your shell — not written to repo or Cursor store.
# Usage:
#   export DATABASE_URL='...'
#   export JWT_ACCESS_SECRET='...'
#   export CORS_ORIGINS='https://your-app.vercel.app'
#   export APP_PUBLIC_URL='https://your-app.vercel.app'   # optional
#   ./scripts/oracle-deploy-from-mac.sh 130.210.28.106
set -euo pipefail

HOST="${1:?Usage: $0 <oracle-public-ipv4>}"
KEY="${ORACLE_SSH_KEY:-$HOME/.ssh/oracle-athra}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -f "$KEY" ]; then
  echo "ERROR: SSH key not found: $KEY" >&2
  exit 1
fi

for var in DATABASE_URL JWT_ACCESS_SECRET CORS_ORIGINS; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: export $var before running" >&2
    exit 1
  fi
done

echo "==> SSH test"
ssh -i "$KEY" -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new "ubuntu@${HOST}" 'echo connected'

echo "==> bootstrap on VM"
ssh -i "$KEY" "ubuntu@${HOST}" \
  DATABASE_URL="$DATABASE_URL" \
  JWT_ACCESS_SECRET="$JWT_ACCESS_SECRET" \
  CORS_ORIGINS="$CORS_ORIGINS" \
  APP_PUBLIC_URL="${APP_PUBLIC_URL:-}" \
  FITCORE_AUTOMATION_SECRET="${FITCORE_AUTOMATION_SECRET:-${ATHRA_AUTOMATION_SECRET:-}}" \
  ATHRA_AUTOMATION_SECRET="${ATHRA_AUTOMATION_SECRET:-${FITCORE_AUTOMATION_SECRET:-}}" \
  RAZORPAY_KEY_ID="${RAZORPAY_KEY_ID:-}" \
  RAZORPAY_KEY_SECRET="${RAZORPAY_KEY_SECRET:-}" \
  RAZORPAY_WEBHOOK_SECRET="${RAZORPAY_WEBHOOK_SECRET:-}" \
  FITCORE_MEMBERSHIP_EXPIRY_CRON_ENABLED="${FITCORE_MEMBERSHIP_EXPIRY_CRON_ENABLED:-true}" \
  FITCORE_GYM_SLUG="${FITCORE_GYM_SLUG:-}" \
  API_THROTTLE_LIMIT="${API_THROTTLE_LIMIT:-300}" \
  'bash -s' <"$SCRIPT_DIR/oracle-bootstrap.sh"

echo "==> public health (port 3001 — open in Oracle Security List)"
curl -fsS -m 15 "http://${HOST}:3001/api/v1/health" || echo "WARN: port 3001 not reachable from internet — open TCP 3001 or add nginx"

echo ""
echo "Done. Update Vercel NEXT_PUBLIC_API_URL=http://${HOST}:3001/api/v1 then test login."
echo "Render pause only after public health works."