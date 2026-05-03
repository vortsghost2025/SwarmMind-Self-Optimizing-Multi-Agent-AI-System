# Ubuntu Migration Summary — 2026-05-03

## Overview
Migrated 4-lane SwarmMind system from Windows desktop (S:/ paths) to headless Ubuntu laptop (/home/we4free/agent/repos/).

## Platform
- OS: Ubuntu (headless)
- Node.js: v20.20.2 (via nvm)
- User: we4free
- Repos dir: /home/we4free/agent/repos/

## What Was Done

### 1. Platform-Aware Path Resolution
- Patched `scripts/util/lane-discovery.js` to auto-detect OS:
  - Windows: resolves S:/ paths (backward compatible)
  - Linux: resolves /home/we4free/agent/repos/ paths
- Added `sToLocal()` function for runtime S:/ → Ubuntu conversion
- Added `LaneDiscovery` class wrapper for lanes that use the class interface (Library, Archivist, Kernel)
- Backed up original Windows-only version as `lane-discovery-win-backup.js`

### 2. Core Script Patches (SwarmMind)
Patched 70+ JS scripts to use `lane-discovery.js` instead of hardcoded S:/ paths:
- 7 core operational scripts (lane-worker, relay-daemon, heartbeat, agent-presence, codex-wake-packet, create-signed-message, generic-task-executor)
- 64 additional runtime scripts via batch patcher
- 3 syntax errors from batch patching fixed manually

### 3. Cross-Lane Patches
- **Library**: Added LaneDiscovery class to lane-discovery.js, patched heartbeat.js
- **Archivist**: Added s() path converter + _convertPaths() to lane-discovery.js
- **Kernel**: Already patched by Kernel agent (s() function approach)

### 4. PowerShell → Bash Replacements
- `inbox-watcher.ps1` → `inbox-watcher.sh`
- `run-daily-report.ps1` → `run-daily-report.sh`
- `lane-rc.sh` — bash path resolver
- `setup-cron.sh` — safe cron installer

### 5. Service Management
- Found respawner: `systemctl --user` user services with `Restart=always`
- Created `archivist-lane-worker.service`
- All 4 lanes now running as systemd user services

### 6. Configuration Updates
- `config/allowed_roots.json` — Ubuntu paths
- `lane-info.json` — Ubuntu paths

### 7. Cron Jobs
- Heartbeat: every 5 min
- Inbox watcher: every 2 min
- Daily report: 06:00 UTC

## Systemd Services
| Service | Lane | Status |
|---------|------|--------|
| swarmmind-lane-worker | SwarmMind | active |
| library-lane-worker | Library | active |
| kernel-lane-worker | Kernel | active |
| archivist-lane-worker | Archivist | active |

Commands:
- `systemctl --user status <service>` — check status
- `systemctl --user stop <service>` — stop (patches won't revert if stopped first)
- `systemctl --user start <service>` — start
- `journalctl --user -u <service>` — view logs

## Important: Sync Revert Issue
The lane-worker processes with `--watch` flag can revert file changes via cross-lane sync.
Always `systemctl --user stop <lane>-lane-worker` before editing synced scripts.
The lane-discovery.js patch is stable because the workers now use it (not fight it).

## Files NOT Patched (by design)
- `scripts/test-*.js` — test files with S:/ paths in test input strings (not runtime)
- `scripts/util/lane-discovery-win-backup.js` — intentional backup
- `scripts/util/ubuntu-adapter.js` — alternative adapter (standalone)
- `scripts/util/ubuntu-patcher.js` — runtime monkey-patcher (alternative approach)
- `data/site-index.json` — large historical data file (66 S:/ refs in content snippets)
- `docs/**/*.json` — historical broadcast/evidence archives
- `lanes/broadcast/*.json` — historical broadcast messages
- `.md` files — documentation (S:/ refs are instructional, not executable)
- `.kilo/` — Kilo plans (not operational)

## Remaining S:/ References
- ~310 in JSON data/archive files (historical, not runtime)
- ~54 in Markdown docs (instructional, not executable)
- ~18 in test files (test input strings, not runtime)
- ~4 in bash scripts (string manipulation patterns, correct as-is)

## What the User Can Do
1. **Monitor services**: `systemctl --user status '*lane*'`
2. **Check logs**: `tail -f ~/agent/logs/<lane>-lane-worker.log`
3. **If patches revert**: Stop the service first, then re-apply
4. **Add more lanes**: Copy lane-discovery.js pattern, create systemd service

## What Other Lanes Can Do
- **Kernel (on Windows)**: No changes needed. Already platform-native. CUDA/GPU work stays here.
- **Library (on Ubuntu)**: Already patched and running. Monitor for new S:/ paths in future commits.
- **Archivist (on Ubuntu)**: Already patched and running. Watch for sync operations that might revert lane-discovery.js.
- **Any lane**: When adding new scripts, use `require('./util/lane-discovery')` instead of hardcoded S:/ paths.
