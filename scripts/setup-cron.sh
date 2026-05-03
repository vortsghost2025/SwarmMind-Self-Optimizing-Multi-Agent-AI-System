#!/usr/bin/env bash
# setup-cron.sh — Install SwarmMind cron jobs on Ubuntu
# Replaces Windows Task Scheduler (SwarmMindHeartbeat, SwarmMindWatcher)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LANE_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$HOME/agent/logs"
mkdir -p "$LOG_DIR"

CRON_MARKER="# SWARMMIND-LANE-JOBS"

# Build the crontab entries
HEARTBEAT_JOB="*/5 * * * * $LANE_ROOT/scripts/heartbeat.sh --lane swarmmind --once >> $LOG_DIR/swarmmind-heartbeat.log 2>&1"
WATCHER_JOB="*/2 * * * * LANES=swarmmind $LANE_ROOT/scripts/inbox-watcher.sh >> $LOG_DIR/swarmmind-watcher.log 2>&1"
DAILY_JOB="0 6 * * * $LANE_ROOT/scripts/run-daily-report.sh >> $LOG_DIR/swarmmind-daily-report.log 2>&1"

# Extract existing crontab, remove old SwarmMind entries, add new ones
EXISTING="$(crontab -l 2>/dev/null | grep -v "$CRON_MARKER" || true)"

NEW_CRON="$EXISTING
$CRON_MARKER
$HEARTBEAT_JOB
$WATCHER_JOB
$DAILY_JOB
$CRON_MARKER-END"

echo "$NEW_CRON" | crontab -

echo "SwarmMind cron jobs installed:"
echo "  Heartbeat: every 5 min -> $LOG_DIR/swarmmind-heartbeat.log"
echo "  Watcher:   every 2 min -> $LOG_DIR/swarmmind-watcher.log"
echo "  Daily:     06:00 daily -> $LOG_DIR/swarmmind-daily-report.log"
echo ""
echo "Verify: crontab -l"
