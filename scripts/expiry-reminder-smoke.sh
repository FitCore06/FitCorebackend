#!/usr/bin/env sh
# Smoke-test membership expiry automation (manual cron trigger).
set -eu
API_BASE="${API_BASE:-http://localhost:3001/api/v1}"
SECRET="${FITCORE_AUTOMATION_SECRET:?Set FITCORE_AUTOMATION_SECRET}"
GYM="${FITCORE_GYM_SLUG:-demo-gym}"
DAYS="${FITCORE_EXPIRY_NOTIFY_DAYS:-7}"

curl -sS -X POST \
  "${API_BASE}/automation/membership-expiry/run?gymSlug=${GYM}&days=${DAYS}" \
  -H "X-FitCore-Automation-Secret: ${SECRET}" \
  -H "Content-Type: application/json"
echo ""