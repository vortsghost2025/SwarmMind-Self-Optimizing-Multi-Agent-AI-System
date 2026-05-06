#!/usr/bin/env bash
# Install all 4 lane-worker systemd user services on Ubuntu headless
# Run once: bash config/systemd/install-services.sh
set -euo pipefail

SYSTEMD_DIR="${HOME}/.config/systemd/user"
mkdir -p "$SYSTEMD_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOS_BASE="$(cd "$SCRIPT_DIR/../../.." && pwd)"

declare -A SERVICES
SERVICES[kernel]="${REPOS_BASE}/kernel-lane"
SERVICES[archivist]="${REPOS_BASE}/Archivist-Agent"
SERVICES[swarmmind]="${REPOS_BASE}/SwarmMind"
SERVICES[library]="${REPOS_BASE}/self-organizing-library"

for lane in kernel archivist swarmmind library; do
  src="${SERVICES[$lane]}/config/systemd/${lane}-lane-worker.service"
  if [ ! -f "$src" ]; then
    echo "SKIP: $lane — service file not found at $src"
    continue
  fi

  cp "$src" "${SYSTEMD_DIR}/${lane}-lane-worker.service"
  echo "INSTALLED: ${lane}-lane-worker.service"
done

systemctl --user daemon-reload
echo ""
echo "Services installed. Enable and start with:"
echo "  systemctl --user enable --now kernel-lane-worker"
echo "  systemctl --user enable --now archivist-lane-worker"
echo "  systemctl --user enable --now swarmmind-lane-worker"
echo "  systemctl --user enable --now library-lane-worker"
echo ""
echo "Or use: ${REPOS_BASE}/SwarmMind/scripts/start-all-lanes.sh"
