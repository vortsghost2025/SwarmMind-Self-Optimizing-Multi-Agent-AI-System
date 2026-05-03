#!/usr/bin/env bash
# Ubuntu-native replacement for run-daily-report.ps1
# Auto-detects lane from script path

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LANE_ROOT="$(dirname "$SCRIPT_DIR")"
LANE="$(basename "$LANE_ROOT" | tr '[:upper:]' '[:lower:]')"

NODE_SCRIPT="$SCRIPT_DIR/daily-productivity-report.js"

echo "[$LANE] Running daily productivity report at $(date -Is)..."

if [[ ! -f "$NODE_SCRIPT" ]]; then
  echo "[$LANE] ERROR: $NODE_SCRIPT not found" >&2
  exit 1
fi

export LANE="$LANE"
if node "$NODE_SCRIPT"; then
  echo "[$LANE] Report generated successfully"
  exit 0
else
  echo "[$LANE] Report script failed with exit code $?" >&2
  exit 1
fi
