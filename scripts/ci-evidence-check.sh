#!/bin/bash
set -e
LANES="archivist library kernel swarmmind"
FAILED=0
for lane in $LANES; do
  INBOX="/s/SwarmMind/lanes/$lane/inbox"
  if [ -d "$INBOX" ]; then
    for f in $INBOX/*.json; do
      if [ -f "$f" ]; then
        node /s/SwarmMind/scripts/evidence-exchange-check.js "$f" > /dev/null 2>&1 || {
          echo "Evidence check failed: $f"
          FAILED=$((FAILED+1))
        }
      fi
    done
  fi
done
if [ $FAILED -gt 0 ]; then
  echo "CI Evidence check: $FAILED files failed."
  exit 1
fi
echo "CI Evidence check: PASS"
