#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scrape-session.sh <url> [output_file]
# Starts Lightpanda, scrapes page content, outputs text, cleans up.

URL="${1:?Usage: $0 <url> [output_file]}"
OUTPUT="${2:-/dev/stdout}"
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

# Verify CDP is ready
if ! curl -sf "http://${HOST}:${PORT}/json/version" >/dev/null; then
  echo "ERROR: Lightpanda failed to start on ${HOST}:${PORT}" >&2
  exit 1
fi

# Scrape
$LP open "$URL"
$LP wait --load networkidle
$LP get text body > "$OUTPUT"

echo "Done: $URL" >&2
