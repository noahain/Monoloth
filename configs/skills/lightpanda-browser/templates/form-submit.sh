#!/usr/bin/env bash
set -euo pipefail

# Usage: ./form-submit.sh <form_url>
# Opens a form page, snapshots interactive elements, and prints refs.
# User fills in the interaction commands after reviewing the snapshot.

FORM_URL="${1:?Usage: $0 <form_url>}"
PORT="${LIGHTPANDA_PORT:-9222}"
HOST="${LIGHTPANDA_HOST:-127.0.0.1}"
LP="agent-browser --cdp $PORT"

cleanup() {
  $LP close 2>/dev/null || true
  kill "$LIGHTPANDA_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Start Lightpanda
lightpanda serve --host "$HOST" --port "$PORT" &
LIGHTPANDA_PID=$!
sleep 1

if ! curl -sf "http://${HOST}:${PORT}/json/version" >/dev/null; then
  echo "ERROR: Lightpanda failed to start on ${HOST}:${PORT}" >&2
  exit 1
fi

# Open form and snapshot
$LP open "$FORM_URL"
$LP wait --load networkidle

echo "=== Interactive Elements ===" >&2
$LP snapshot -i

echo "" >&2
echo "=== Fill and submit using refs above ===" >&2
echo "Example:" >&2
echo "  $LP fill @e1 \"value\"" >&2
echo "  $LP click @eN  # submit button" >&2
echo "  $LP wait --load networkidle" >&2
echo "  $LP snapshot -i  # verify result" >&2
