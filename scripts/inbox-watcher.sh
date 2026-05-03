#!/usr/bin/env bash
# Ubuntu-native replacement for inbox-watcher.ps1
# Single-pass watcher: inbox -> lane-worker -> task-executor -> relay-daemon
# Designed for cron invocation (one pass per trigger)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LANE_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_FILE="${LOG_FILE:-$SCRIPT_DIR/inbox-watcher.log}"
NODE_EXE="${NODE_EXE:-$(which node)}"
SKIP_EXECUTOR="${SKIP_EXECUTOR:-0}"
LANES="${LANES:-swarmmind}"

REPOS_DIR="$(dirname "$LANE_ROOT")"

declare -A LANE_ROOTS
LANE_ROOTS[archivist]="$REPOS_DIR/Archivist-Agent"
LANE_ROOTS[kernel]="$REPOS_DIR/kernel-lane"
LANE_ROOTS[library]="$REPOS_DIR/self-organizing-library"
LANE_ROOTS[swarmmind]="$LANE_ROOT"

log() {
  local ts
  ts="$(date -Is)"
  echo "$ts $1" | tee -a "$LOG_FILE"
}

count_files() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then echo 0; return; fi
  local n
  n="$(find "$dir" -maxdepth 1 -name '*.json' ! -name 'heartbeat*' -type f 2>/dev/null | wc -l)"
  echo "$n"
}

run_step() {
  local name="$1"
  local script="$2"
  local args="$3"
  local cwd="$4"
  local result
  result="$(cd "$cwd" && "$NODE_EXE" "$script" $args 2>&1)" || {
    log "  [$name] ERROR: $result"
    return 1
  }
  log "  [$name] $(echo "$result" | tr '\n' ' ')"
  return 0
}

check_agent_presence() {
  local lane="$1"
  local root="${LANE_ROOTS[$lane]}"
  local lock_file="$root/lanes/$lane/state/agent-active.lock"
  local mode_file="$root/lanes/$lane/state/watcher-mode.json"

  if [[ -f "$lock_file" ]]; then
    return 1
  fi
  if [[ -f "$mode_file" ]]; then
    local mode
    mode="$("$NODE_EXE" -e "const m=JSON.parse(require('fs').readFileSync('$mode_file','utf8')); console.log(m.mode||'auto')" 2>/dev/null)" || mode="auto"
    case "$mode" in
      agent-assist|manual|disabled) return 1 ;;
    esac
  fi
  return 0
}

if [[ "$LANES" == "all" ]]; then
  ACTIVE_LANES="$(echo "${!LANE_ROOTS[@]}" | tr ' ' '\n' | sort | tr '\n' ' ')"
else
  ACTIVE_LANES="$LANES"
fi

ARCHIVIST_ROOT="${LANE_ROOTS[archivist]}"

log "[watcher] Single-pass - lanes: $ACTIVE_LANES - skipExecutor=$SKIP_EXECUTOR"
log "[watcher] Pipeline: lane-worker -> task-executor -> relay-daemon"

any_activity=false

for lane in $ACTIVE_LANES; do
  lane_lower="${lane,,}"
  if [[ -z "${LANE_ROOTS[$lane_lower]+x}" ]]; then
    log "[watcher] Unknown lane: $lane - skipping"
    continue
  fi

  root="${LANE_ROOTS[$lane_lower]}"
  inbox_dir="$root/lanes/$lane_lower/inbox"
  ar_dir="$inbox_dir/action-required"
  outbox_dir="$root/lanes/$lane_lower/outbox"

  inbox_count="$(count_files "$inbox_dir")"
  ar_count="$(count_files "$ar_dir")"
  outbox_count="$(count_files "$outbox_dir")"

  if [[ "$inbox_count" -eq 0 && "$ar_count" -eq 0 && "$outbox_count" -eq 0 ]]; then
    continue
  fi

  if ! check_agent_presence "$lane_lower"; then
    log "[watcher] ${lane_lower} SKIPPED (agent active or mode=manual/disabled) inbox=$inbox_count ar=$ar_count outbox=$outbox_count"
    continue
  fi

  log "[watcher] ${lane_lower} inbox=$inbox_count ar=$ar_count outbox=$outbox_count"

  if [[ "$inbox_count" -gt 0 ]]; then
    log "[watcher] Step 1: Running lane-worker for ${lane_lower}"
    run_step "lane-worker" "$root/scripts/lane-worker.js" "--lane $lane_lower --apply" "$root" || true
    if [[ "$lane_lower" == "swarmmind" ]]; then
      run_step "codex-wake" "$root/scripts/codex-wake-packet.js" "--apply" "$root" || true
    fi
    any_activity=true
  fi

  if [[ "$SKIP_EXECUTOR" -eq 0 && "$ar_count" -gt 0 ]]; then
    log "[watcher] Step 2: Running task-executor for ${lane_lower}"
    run_step "task-executor" "$ARCHIVIST_ROOT/scripts/generic-task-executor.js" "$lane_lower --apply" "$root" || true
    if [[ "$lane_lower" == "swarmmind" ]]; then
      run_step "codex-wake" "$root/scripts/codex-wake-packet.js" "--apply" "$root" || true
    fi
    any_activity=true
  fi

  if [[ "$outbox_count" -gt 0 ]]; then
    log "[watcher] Step 3: Running relay-daemon for ${lane_lower}"
    run_step "relay-daemon" "$root/scripts/relay-daemon.js" "--apply" "$root" || true
    any_activity=true
  fi
done

if [[ "$any_activity" == "false" ]]; then
  log "[watcher] idle - nothing to process"
fi

log "[watcher] Pass complete"
