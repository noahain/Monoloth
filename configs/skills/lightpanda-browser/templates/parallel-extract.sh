#!/usr/bin/env bash
set -euo pipefail

# Usage: ./parallel-extract.sh <url_file> [output_dir]
# Reads URLs from a file (one per line), extracts text content in parallel
# using multiple Lightpanda instances.

URL_FILE="${1:?Usage: $0 <url_file> [output_dir]}"
OUTPUT_DIR="${2:-.}"
MAX_PARALLEL="${MAX_PARALLEL:-4}"
BASE_PORT="${LIGHTPANDA_PORT:-9222}"
HOST="${LIGHTPANDA_HOST:-127.0.0.1}"

PIDS=()

cleanup() {
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT

mkdir -p "$OUTPUT_DIR"

# Start Lightpanda instances
for i in $(seq 0 $((MAX_PARALLEL - 1))); do
  port=$((BASE_PORT + i))
  lightpanda serve --host "$HOST" --port "$port" &
  PIDS+=($!)
done
sleep 1

# Verify all instances
for i in $(seq 0 $((MAX_PARALLEL - 1))); do
  port=$((BASE_PORT + i))
  if ! curl -sf "http://${HOST}:${port}/json/version" >/dev/null; then
    echo "ERROR: Lightpanda instance on port ${port} failed to start" >&2
    exit 1
  fi
done

echo "Started ${MAX_PARALLEL} Lightpanda instances (ports ${BASE_PORT}-$((BASE_PORT + MAX_PARALLEL - 1)))" >&2

# Process URLs round-robin across instances
url_index=0
while IFS= read -r url; do
  [[ -z "$url" || "$url" == \#* ]] && continue

  instance=$((url_index % MAX_PARALLEL))
  port=$((BASE_PORT + instance))
  LP="agent-browser --cdp $port"

  # Sanitize URL to filename
  filename=$(echo "$url" | sed 's|https\?://||;s|[^a-zA-Z0-9._-]|_|g' | head -c 200)

  (
    $LP open "$url"
    $LP wait --load networkidle
    $LP get text body > "${OUTPUT_DIR}/${filename}.txt"
    echo "Extracted: $url" >&2
  ) &

  url_index=$((url_index + 1))

  # Throttle: wait if we've filled all slots
  if (( url_index % MAX_PARALLEL == 0 )); then
    wait
  fi
done < "$URL_FILE"

wait
echo "Done: ${url_index} URLs extracted to ${OUTPUT_DIR}/" >&2
