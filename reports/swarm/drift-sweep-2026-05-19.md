OUTPUT_PROVENANCE:
agent: swarm-offline-runner/1.0.0
lane: swarmmind
target: drift-sweep-2026-05-19
generated_at: 2026-05-19T07:41:40.540Z
session_id: offline-2026-05-19

# Cross-Lane Drift Sweep Report — 2026-05-19

**Runner version:** 1.0.0
**Lanes checked:** archivist, authority, kernel, swarmmind, library, kucoin
**Items checked:** 18 (15 scripts + 3 util modules)

## Summary

| Classification | Count |
|----------------|-------|
| OK (consistent) | 18 |
| NEEDS_SYNC | 0 |
| RISK | 0 |
| MISSING | 0 |

## Consistent Scripts

- lane-worker.js: `ebe369b1ca61...`
- task-executor.js: `e597ccd1f51d...`
- generic-task-executor.js: `0cffaf09639b...`
- relay-daemon.js: `4f68f2f862e9...`
- heartbeat.js: `1086122079a9...`
- output-provenance.js: `192cadb3da9d...`
- autonomous-executor.js: `76841c34cc1c...`
- blocked-remediator.js: `9818a92d6cea...`
- store-journal.js: `2a554c0d3b7d...`
- executor-watcher.js: `6a9e5b7d099b...`
- post-compact-audit.js: `06252b89e096...`
- headless-self-audit.js: `2541550fcde4...`
- node-version-guard.js: `91b37ce00e6e...`
- sync-canonical-scripts.js: `9e1d25a68b96...`
- test-headless-self-audit.js: `4656e1ce783e...`
- scripts/util/lane-discovery.js: `783390dd0ee6...`
- scripts/util/atomic-write.js: `8ecb01ca60e7...`
- scripts/util/sanitize-filename.js: `66712fb4157c...`
