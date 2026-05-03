#!/usr/bin/env bash
# lane-rc.sh — Source this from other bash scripts to get lane paths
# Replaces hardcoded S:/ paths with Ubuntu-native equivalents
# Usage: source /home/we4free/agent/repos/SwarmMind/scripts/lane-rc.sh

_REPOS_DIR="/home/we4free/agent/repos"

LANE_ARCHIVIST_ROOT="$_REPOS_DIR/Archivist-Agent"
LANE_KERNEL_ROOT="$_REPOS_DIR/kernel-lane"
LANE_LIBRARY_ROOT="$_REPOS_DIR/self-organizing-library"
LANE_SWARMMIND_ROOT="$_REPOS_DIR/SwarmMind"

lane_root() {
  case "${1,,}" in
    archivist|authority) echo "$LANE_ARCHIVIST_ROOT" ;;
    kernel)              echo "$LANE_KERNEL_ROOT" ;;
    library)             echo "$LANE_LIBRARY_ROOT" ;;
    swarmmind)           echo "$LANE_SWARMMIND_ROOT" ;;
    *) echo "ERROR: unknown lane '$1'" >&2; return 1 ;;
  esac
}

lane_inbox()  { echo "$(lane_root "$1")/lanes/${1,,}/inbox"; }
lane_outbox() { echo "$(lane_root "$1")/lanes/${1,,}/outbox"; }
lane_state()  { echo "$(lane_root "$1")/lanes/${1,,}/state"; }

# Translate a Windows S:/ path to its Ubuntu equivalent
# e.g., s_to_local "S:/SwarmMind/scripts/foo.js" -> "/home/we4free/agent/repos/SwarmMind/scripts/foo.js"
s_to_local() {
  local p="$1"
  p="${p#S:/}"
  echo "$_REPOS_DIR/$p"
}
