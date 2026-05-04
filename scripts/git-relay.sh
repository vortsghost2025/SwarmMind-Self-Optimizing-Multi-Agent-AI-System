#!/usr/bin/env bash
set -euo pipefail

LANE="${1:-swarmmind}"
MODE="${2:-send}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTBOX="$REPO_ROOT/lanes/$LANE/outbox"
INBOX="$REPO_ROOT/lanes/$LANE/inbox"
LOG="$REPO_ROOT/lanes/$LANE/state/git-relay.log"
BRANCH="relay/$LANE"

mkdir -p "$(dirname "$LOG")"

log() { echo "[$(date -Iseconds)] [git-relay] [$LANE] [$MODE] $*" | tee -a "$LOG"; }

git_in_repo() { git -C "$REPO_ROOT" "$@"; }

send_outbox() {
  if [ ! -d "$OUTBOX" ] || [ -z "$(ls -A "$OUTBOX" 2>/dev/null | grep '\.json$')" ]; then
    log "no outbox messages to send"
    return 0
  fi

  local count
  count=$(ls -1 "$OUTBOX"/*.json 2>/dev/null | wc -l)
  log "sending $count outbox messages"

  git_in_repo add -f "lanes/$LANE/outbox/"
  git_in_repo add "evidence/" 2>/dev/null || true
  git_in_repo add "config/resilience-policy.json" 2>/dev/null || true
  git_in_repo add -f "lanes/broadcast/trust-store.json" 2>/dev/null || true
  git_in_repo add -f ".identity/public.pem" 2>/dev/null || true
  git_in_repo add ".identity/keys.json" 2>/dev/null || true

  if git_in_repo diff --cached --quiet; then
    log "nothing staged after add"
    return 0
  fi

  git_in_repo commit -m "relay: $LANE outbox $(date -u +%Y%m%dT%H%M%SZ)" --no-gpg-sign
  git_in_repo push origin HEAD 2>&1 | tee -a "$LOG"
  log "pushed $count messages"
}

receive_inbox() {
  git_in_repo fetch origin 2>&1 | tee -a "$LOG"

  local remote_branch
  remote_branch=$(git_in_repo branch -r --list "origin/$BRANCH" 2>/dev/null | head -1 || true)

  log "checking for incoming relay messages on origin/main"
  git_in_repo pull --rebase origin main 2>&1 | tee -a "$LOG" || true

  for other_lane in archivist library kernel; do
    local other_outbox="$REPO_ROOT/lanes/$other_lane/outbox"
    if [ ! -d "$other_outbox" ]; then continue; fi

    for msg_file in "$other_outbox"/*.json; do
      [ -f "$msg_file" ] || continue

      local target
      target=$(python3 -c "import json; print(json.load(open('$msg_file')).get('to',''))" 2>/dev/null || echo "")

      if [ "$target" = "$LANE" ]; then
        local basename
        basename=$(basename "$msg_file")
        local dest="$INBOX/$basename"

        if [ -f "$dest" ]; then
          log "already received: $basename"
          continue
        fi

        cp "$msg_file" "$dest"
        log "delivered: $basename from $other_lane"
      fi
    done
  done
}

case "$MODE" in
  send)   send_outbox ;;
  recv|receive) receive_inbox ;;
  both)   send_outbox; receive_inbox ;;
  *)      echo "Usage: $0 <lane> [send|recv|both]"; exit 1 ;;
esac
