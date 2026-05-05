#!/usr/bin/env bash
# Start all 4 lane daemons on Ubuntu headless
set -euo pipefail

echo "Starting 4-lane autonomous runtime..."

# Enable and start systemd lane-worker services
for lane in archivist swarmmind kernel library; do
  systemctl --user enable "${lane}-lane-worker" 2>/dev/null
  systemctl --user start "${lane}-lane-worker" 2>/dev/null
  echo "  ${lane}-lane-worker: $(systemctl --user is-active ${lane}-lane-worker)"
done

echo ""
echo "Lane workers running. Heartbeats on 5-min crontab."
echo "Use: scripts/overseer-health-check.js to verify."
echo "Use: scripts/stop-all-lanes.sh to shut down."
