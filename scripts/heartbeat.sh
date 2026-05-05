#!/usr/bin/env bash
set -euo pipefail
exec /home/we4free/.nvm/versions/node/v20.20.2/bin/node /home/we4free/agent/repos/SwarmMind/scripts/heartbeat.js --lane swarmmind --once
