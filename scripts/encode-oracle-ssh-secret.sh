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
echo "OK: stdout contains only the ORACLE_SSH_KEY_B64 value." >&2
echo "Delete repository secret ORACLE_SSH_KEY if present (use only B64)." >&2
printf '%s\n' "$B64"
