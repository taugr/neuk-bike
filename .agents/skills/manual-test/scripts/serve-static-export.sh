#!/usr/bin/env bash
set -euo pipefail

HOST="${MANUAL_TEST_HOST:-0.0.0.0}"
PORT="${MANUAL_TEST_PORT:-4181}"
LOCAL_URL="http://127.0.0.1:${PORT}/"
MOCK_GPS_URL="${LOCAL_URL}?mockGps=55.9533,-3.1883"
SERVER_LOG="${TMPDIR:-/tmp}/neuk-bike-static-${PORT}.log"
PID_FILE="${TMPDIR:-/tmp}/neuk-bike-static-${PORT}.pid"

if [[ ! -f package.json ]] || [[ ! -f next.config.ts ]]; then
  echo "Run this script from the neuk-bike repo root." >&2
  exit 1
fi

build_started_at="$(date +%s)"
pnpm build

started_server_pid=""
if ! lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  nohup python3 -m http.server "${PORT}" --bind "${HOST}" --directory out >"${SERVER_LOG}" 2>&1 </dev/null &
  server_pid="$!"
  started_server_pid="${server_pid}"
  echo "${server_pid}" >"${PID_FILE}"
  echo "Started static export server on ${HOST}:${PORT} (pid ${server_pid})."
else
  echo "Port ${PORT} is already listening; verifying the existing server response."
fi

for _ in 1 2 3 4 5; do
  if curl -fsSI "${LOCAL_URL}" >/tmp/neuk-bike-static-headers-"${PORT}".txt; then
    break
  fi
  sleep 1
done

headers_file="/tmp/neuk-bike-static-headers-${PORT}.txt"
if [[ ! -s "${headers_file}" ]]; then
  echo "Static server did not respond at ${LOCAL_URL}." >&2
  exit 1
fi

last_modified="$(awk 'BEGIN{IGNORECASE=1} /^Last-Modified:/ {sub(/^Last-Modified:[[:space:]]*/, ""); sub(/\r$/, ""); print; exit}' "${headers_file}")"
if [[ -z "${last_modified}" ]]; then
  echo "Could not verify freshness: response has no Last-Modified header." >&2
  exit 1
fi

served_epoch="$(date -j -f "%a, %d %b %Y %H:%M:%S %Z" "${last_modified}" +%s 2>/dev/null || true)"
if [[ -z "${served_epoch}" ]]; then
  echo "Could not parse Last-Modified header: ${last_modified}" >&2
  exit 1
fi

if (( served_epoch + 2 < build_started_at )); then
  echo "Freshness check failed: server responded with ${last_modified}, before this build started." >&2
  echo "The process on port ${PORT} may not be serving the regenerated out/ directory." >&2
  exit 1
fi

if [[ -n "${started_server_pid}" ]] && ! kill -0 "${started_server_pid}" 2>/dev/null; then
  echo "Static server exited after the freshness check. See ${SERVER_LOG}." >&2
  exit 1
fi

echo "Freshness check passed: served export was modified at ${last_modified}."
echo "Local URL: ${LOCAL_URL}"
echo "Mock GPS URL: ${MOCK_GPS_URL}"

if [[ -n "${started_server_pid}" ]]; then
  echo "Keeping static export server running; stop this command when manual testing is finished."
  wait "${started_server_pid}"
fi
