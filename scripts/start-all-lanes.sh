#!/usr/bin/env bash
# Start all 4 lane daemons on Ubuntu headless
# Uses systemd --user (requires linger enabled) with fallback to direct node
set -euo pipefail

export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus
NODE=/home/we4free/.nvm/versions/node/v20.20.2/bin/node
LOG_DIR=/home/we4free/agent/logs

mkdir -p "$LOG_DIR"

echo "Starting 4-lane autonomous runtime..."

declare -A LANES
LANES[archivist]=/home/we4free/agent/repos/Archivist-Agent
LANES[swarmmind]=/home/we4free/agent/repos/SwarmMind
LANES[kernel]=/home/we4free/agent/repos/kernel-lane
LANES[library]=/home/we4free/agent/repos/self-organizing-library

for lane in archivist swarmmind kernel library; do
  repo="${LANES[$lane]}"
  
  # Check if already running
  if ps -eo args 2>/dev/null | grep -q "lane-worker.*--lane ${lane}"; then
    echo "  $lane: already running"
    continue
  fi
  
  # Try systemd first
  if systemctl --user is-active "${lane}-lane-worker" &>/dev/null; then
    echo "  $lane: systemd service already active"
  elif systemctl --user start "${lane}-lane-worker" 2>/dev/null; then
    echo "  $lane: started via systemd"
  else
    # Fallback: direct node invocation with nohup
    cd "$repo"
    nohup "$NODE" scripts/lane-worker.js --lane "$lane" --apply --watch --poll-seconds 20 \
      >> "${LOG_DIR}/${lane}-lane-worker.log" 2>> "${LOG_DIR}/${lane}-lane-worker.err.log" &
    echo "  $lane: started via nohup (PID $!)"
  fi
done

echo ""
echo "Lane workers running. Heartbeats on 5-min crontab."
echo "Check health: node /home/we4free/agent/repos/SwarmMind/scripts/overseer-health-check.js"
echo "Stop all: /home/we4free/agent/repos/SwarmMind/scripts/stop-all-lanes.sh"
