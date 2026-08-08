#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ID="${WEAPP_APP_ID:-wx20c3e07df7656e03}"
MEMORY_HIGH="${WEAPP_MEMORY_HIGH:-400M}"
MEMORY_MAX="${WEAPP_MEMORY_MAX:-480M}"
CPU_QUOTA="${WEAPP_CPU_QUOTA:-70%}"
NODE_HEAP_MB="${WEAPP_NODE_HEAP_MB:-256}"
UNIT="mahjong-weapp-upload-$(date +%s)-$$.service"
NODE_BIN="$(command -v node)"

if ! command -v systemd-run >/dev/null 2>&1; then
  echo "ERROR: systemd-run is required; refusing to run an unguarded WeChat upload." >&2
  exit 1
fi

if [[ ! -d "$PROJECT_ROOT/dist" ]]; then
  echo "ERROR: dist does not exist. Build the mini program before uploading." >&2
  exit 1
fi

NODE_PATH_VALUE="${WEAPP_NODE_PATH:-${NODE_PATH:-}}"
if [[ -z "$NODE_PATH_VALUE" && -d "$PROJECT_ROOT/node_modules/miniprogram-ci" ]]; then
  NODE_PATH_VALUE="$PROJECT_ROOT/node_modules"
elif [[ -z "$NODE_PATH_VALUE" && -d "/root/gpt/mahjong-score-taro/node_modules/miniprogram-ci" ]]; then
  NODE_PATH_VALUE="/root/gpt/mahjong-score-taro/node_modules"
fi

PRIVATE_KEY_PATH="${WEAPP_PRIVATE_KEY_PATH:-$PROJECT_ROOT/private.${APP_ID}.key}"
if [[ ! -f "$PRIVATE_KEY_PATH" && -f "/root/gpt/mahjong-score-taro/private.${APP_ID}.key" ]]; then
  PRIVATE_KEY_PATH="/root/gpt/mahjong-score-taro/private.${APP_ID}.key"
fi
if [[ ! -f "$PRIVATE_KEY_PATH" ]]; then
  echo "ERROR: WeChat upload private key not found. Set WEAPP_PRIVATE_KEY_PATH." >&2
  exit 1
fi

ENV_ARGS=(
  "NODE_OPTIONS=--max-old-space-size=${NODE_HEAP_MB}"
  "WEAPP_APP_ID=${APP_ID}"
  "WEAPP_PRIVATE_KEY_PATH=${PRIVATE_KEY_PATH}"
)
[[ -n "$NODE_PATH_VALUE" ]] && ENV_ARGS+=("NODE_PATH=${NODE_PATH_VALUE}")
[[ -n "${WEAPP_VERSION:-}" ]] && ENV_ARGS+=("WEAPP_VERSION=${WEAPP_VERSION}")
[[ -n "${WEAPP_DESC:-}" ]] && ENV_ARGS+=("WEAPP_DESC=${WEAPP_DESC}")

printf 'Starting guarded WeChat upload: memory.high=%s memory.max=%s cpu=%s node_heap=%sMB\n' \
  "$MEMORY_HIGH" "$MEMORY_MAX" "$CPU_QUOTA" "$NODE_HEAP_MB"

systemd-run --quiet --collect --unit="$UNIT" \
  -p "MemoryHigh=$MEMORY_HIGH" \
  -p "MemoryMax=$MEMORY_MAX" \
  -p "CPUQuota=$CPU_QUOTA" \
  -p Nice=10 \
  -p TasksMax=32 \
  -p OOMPolicy=stop \
  /usr/bin/env "${ENV_ARGS[@]}" \
  "$NODE_BIN" "$PROJECT_ROOT/scripts/upload-weapp.cjs"

while systemctl is-active --quiet "$UNIT"; do
  sleep 2
done

LOG="$(journalctl -u "$UNIT" -n 160 --no-pager 2>/dev/null || true)"
printf '%s\n' "$LOG"

if ! grep -q 'UPLOAD_SUCCESS' <<<"$LOG"; then
  echo "ERROR: guarded WeChat upload did not report UPLOAD_SUCCESS." >&2
  exit 1
fi

echo "Guarded WeChat upload completed successfully."
