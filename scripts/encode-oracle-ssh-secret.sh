#!/usr/bin/env bash
# Print ORACLE_SSH_KEY_B64 for GitHub Actions (single line, validated).
set -euo pipefail
KEY="${1:-$HOME/Downloads/ssh-key-2026-11-23.key}"
[ -f "$KEY" ] || {
  echo "Usage: $0 [/path/to/oracle-private.key]" >&2
  exit 1
}
ssh-keygen -y -f "$KEY" >/dev/null
B64="$(base64 <"$KEY" | tr -d '\n')"
tmpdir="$(mktemp)"
printf '%s' "$B64" | base64 -d >"$tmpdir"
chmod 600 "$tmpdir"
ssh-keygen -y -f "$tmpdir" >/dev/null
rm -f "$tmpdir"
echo "OK: paste the ONE line below into GitHub → ORACLE_SSH_KEY_B64"
echo "Delete repository secret ORACLE_SSH_KEY if present (use only B64)."
echo "$B64"