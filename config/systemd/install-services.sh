#!/usr/bin/env bash
# Install all 8 systemd user services (4 lane-worker + 4 relay-daemon) on Ubuntu headless
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
  for svc in lane-worker relay-daemon; do
    src="${SERVICES[$lane]}/config/systemd/${lane}-${svc}.service"
    if [ ! -f "$src" ]; then
      echo "SKIP: ${lane}-${svc} — not found at $src"
      continue
    fi
    cp "$src" "${SYSTEMD_DIR}/${lane}-${svc}.service"
    echo "INSTALLED: ${lane}-${svc}.service"
  done
done

systemctl --user daemon-reload
echo ""
echo "8 services installed. Enable all with:"
echo "  for s in kernel archivist swarmmind library; do"
echo "    systemctl --user enable --now \${s}-lane-worker"
echo "    systemctl --user enable --now \${s}-relay-daemon"
echo "  done"
echo ""
echo "Or use: ${REPOS_BASE}/SwarmMind/scripts/start-all-lanes.sh"
