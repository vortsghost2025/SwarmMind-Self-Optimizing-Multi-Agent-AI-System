#!/usr/bin/env bash
# Stop all 4 lane daemons on Ubuntu headless
set -euo pipefail

echo "Stopping 4-lane autonomous runtime..."

for lane in archivist swarmmind kernel library; do
  systemctl --user stop "${lane}-lane-worker" 2>/dev/null
  systemctl --user disable "${lane}-lane-worker" 2>/dev/null
  echo "  ${lane}-lane-worker: $(systemctl --user is-active ${lane}-lane-worker || echo stopped)"
done

echo ""
echo "All lane workers stopped. Crontab heartbeats still active."
echo "To also stop heartbeats: crontab -e and comment out LANE-DAEMON-JOBS"
