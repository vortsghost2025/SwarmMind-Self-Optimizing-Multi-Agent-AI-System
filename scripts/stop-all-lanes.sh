#!/usr/bin/env bash
# Stop all 4 lane daemons on Ubuntu headless
# Tries systemd first, then kills direct node processes
set -euo pipefail

export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus

echo "Stopping 4-lane autonomous runtime..."

for lane in archivist swarmmind kernel library; do
  # Try systemd stop
  if systemctl --user is-active "${lane}-lane-worker" &>/dev/null; then
    systemctl --user stop "${lane}-lane-worker" 2>/dev/null
    echo "  $lane: stopped systemd service"
  fi
  
  # Kill any direct node processes
  pids=$(ps -eo pid,args 2>/dev/null | grep "lane-worker.*--lane ${lane}" | grep -v grep | awk '{print $1}')
  if [ -n "$pids" ]; then
    for pid in $pids; do
      kill "$pid" 2>/dev/null
      echo "  $lane: killed direct process PID $pid"
    done
  else
    echo "  $lane: no process found"
  fi
done

echo ""
echo "All lane workers stopped. Crontab heartbeats still active."
echo "To disable heartbeats: crontab -e and comment out LANE-DAEMON-JOBS"
