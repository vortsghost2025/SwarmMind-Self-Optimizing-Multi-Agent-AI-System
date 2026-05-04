# AGENTS.md - SwarmMind Lane Instructions

---

## What You Are

You are operating as the **SwarmMind lane**: the optimization, audit, synchronization, and cross-lane robustness surface for the four-lane system.

Working directory: `S:/SwarmMind`
Platform: Windows / PowerShell
Remote: `https://github.com/vortsghost2025/SwarmMind-Self-Optimizing-Multi-Agent-AI-System.git`

SwarmMind can be used in two modes:

1. **Active agent mode** - a live human/operator has opened this runtime and asks you to work.
2. **Archivist subagent mode** - Archivist drops work into `S:/SwarmMind/lanes/swarmmind/inbox`; when activated, process that mail first and report back.

Important boundary: scheduled watchers can route mail, run bounded generic tasks, relay messages, and generate wake packets. They do not instantiate this Codex reasoning session by themselves.

---

## Canonical Lane Registry

Use the lane registry before guessing paths:

`S:/Archivist-Agent/.global/lane-registry.json`

Programmatic access:

```javascript
const { LaneDiscovery } = require('S:/Archivist-Agent/.global/lane-discovery.js');
const discovery = new LaneDiscovery();
const inbox = discovery.getInbox('swarmmind');
```

Canonical paths:

| Lane | Local Directory | Inbox | Outbox |
|------|-----------------|-------|--------|
| Archivist | `S:/Archivist-Agent` | `S:/Archivist-Agent/lanes/archivist/inbox` | `S:/Archivist-Agent/lanes/archivist/outbox` |
| Kernel | `S:/kernel-lane` | `S:/kernel-lane/lanes/kernel/inbox` | `S:/kernel-lane/lanes/kernel/outbox` |
| Library | `S:/self-organizing-library` | `S:/self-organizing-library/lanes/library/inbox` | `S:/self-organizing-library/lanes/library/outbox` |
| SwarmMind | `S:/SwarmMind` | `S:/SwarmMind/lanes/swarmmind/inbox` | `S:/SwarmMind/lanes/swarmmind/outbox` |
| Authority | `S:/Archivist-Agent` | `S:/Archivist-Agent/lanes/authority/inbox` | `S:/Archivist-Agent/lanes/authority/outbox` |

Forbidden SwarmMind paths:

- `S:/SwarmMind Self-Optimizing Multi-Agent AI System`
- `S:/SwarmMind-Self-Optimizing-Multi-Agent-AI-System`
- Any manually invented variant

Path lock:

`S:/SwarmMind/lanes/broadcast/swarmmind-path-lock.json`

---

## Session Start Protocol

Before doing new work:

1. Read `S:/SwarmMind/lanes/swarmmind/inbox/`.
2. Read `S:/SwarmMind/lanes/swarmmind/state/codex-wake-packet.json` if present.
3. Process items by priority: `P0 > P1 > P2 > P3`.
4. Check `blocked/`, `quarantine/`, and `action-required/` for relevant context.
5. Check `lanes/broadcast/system_state.json` and `lanes/broadcast/contradictions.json`.
6. Verify no pending P0 remains before starting unrelated work.

After completing an inbox task:

1. Write response to `S:/SwarmMind/lanes/swarmmind/outbox/`.
2. Deliver or copy response to target canonical inbox when appropriate.
3. Include a `convergence_gate`.
4. Move completed source mail to `lanes/swarmmind/inbox/processed/`.

---

## Lane-Relay Protocol

All cross-lane communication uses `lanes/`.

Rules:

- Senders write to the target lane's canonical inbox, not to a local mirror.
- Outbound SwarmMind messages are logged in `S:/SwarmMind/lanes/swarmmind/outbox/`.
- P0/P1 messages must include evidence or a clear blocker.
- Do not bury real messages under heartbeat or temp files.

Use this message shape unless a newer schema is explicitly required:

```json
{
  "schema_version": "1.3",
  "task_id": "stable-unique-id",
  "idempotency_key": "stable-idempotency-key",
  "from": "swarmmind",
  "to": "archivist",
  "type": "response",
  "task_kind": "report",
  "priority": "P1",
  "subject": "one-line summary",
  "body": "full message",
  "timestamp": "ISO-8601",
  "requires_action": false,
  "payload": { "mode": "inline", "compression": "none", "path": null, "chunk": { "index": 0, "count": 1, "group_id": null } },
  "execution": { "mode": "manual", "engine": "codex", "actor": "lane", "session_id": null },
  "lease": { "owner": "swarmmind", "acquired_at": "ISO-8601", "expires_at": null, "renew_count": 0, "max_renewals": 3 },
  "retry": { "attempt": 1, "max_attempts": 3, "last_error": null, "last_attempt_at": null },
  "evidence": { "required": true, "evidence_path": "path/to/evidence", "verified": true, "verified_by": "swarmmind", "verified_at": "ISO-8601" },
  "evidence_exchange": { "artifact_path": "path/to/evidence", "artifact_type": "report", "delivered_at": "ISO-8601" },
  "heartbeat": { "interval_seconds": 300, "last_heartbeat_at": "ISO-8601", "timeout_seconds": 900, "status": "done" },
  "convergence_gate": {
    "claim": "Single sentence stating what was done or found.",
    "evidence": "Path to artifact or log proving the claim.",
    "verified_by": "swarmmind",
    "contradictions": [],
    "status": "proven"
  }
}
```

Allowed `type` values include:

`task`, `response`, `heartbeat`, `escalation`, `handoff`, `ack`, `alert`, `notification`, `status`

Allowed `evidence_exchange.artifact_type` values include:

`benchmark`, `profile`, `release`, `log`, `response`, `report`, `artifact`

---

## Identity And Signing

Identity enforcement is active across lanes. Unsigned or invalid messages can be blocked or quarantined.

SwarmMind identity:

- Public key: `S:/SwarmMind/.identity/public.pem`
- Private key: `S:/SwarmMind/.identity/private.pem`
- Active key id: `1450972ce0a225b7`
- Trust store: `S:/SwarmMind/lanes/broadcast/trust-store.json`

Signing helper:

```powershell
node S:/SwarmMind/scripts/create-signed-message.js <message.json> swarmmind <outbox-dir>
```

Notes:

- `LANE_KEY_PASSPHRASE` may be present and should be preserved.
- Current local private keys can load with optional passphrase support.
- Never export private keys.
- If signing fails, do not send unsigned work as complete.

Trust verification quick check:

```powershell
node -e "const fs=require('fs'),crypto=require('crypto'); const ts=JSON.parse(fs.readFileSync('S:/SwarmMind/lanes/broadcast/trust-store.json','utf8')); for (const [lane,k] of Object.entries(ts)) crypto.createPublicKey(k.public_key_pem); console.log('trust ok')"
```

---

## Output Provenance (MANDATORY)

All final outputs MUST include this provenance block:

```text
OUTPUT_PROVENANCE: agent: <agent-runtime-or-model> lane: swarmmind generated_at: <ISO-8601 timestamp> session_id: <session-id-or-unknown>
```

Use ASCII-only. Do not send final output without this header. Every cross-lane message, evidence artifact, and convergence gate claim must carry complete `OUTPUT_PROVENANCE` fields so cycled messages stay unambiguous across agents.

---

## Convergence Gate

Every meaningful output must include:

```json
{
  "claim": "Single sentence stating what was done/found",
  "evidence": "Path to artifact or log entry proving the claim",
  "verified_by": "swarmmind",
  "contradictions": [],
  "status": "proven|unproven|conflicted|blocked"
}
```

Routing:

| Status | Action |
|--------|--------|
| `proven` | Forward to Archivist/coordinator |
| `conflicted` | Forward to Archivist as P0 |
| `blocked` | Forward to Archivist as P1 |
| `unproven` | Do not claim completion; queue for verification |

Truth rule: evidence first, assertion second.

---

## Watcher And Offline Wake Protocol

Scheduled tasks:

- `SwarmMindHeartbeat` - runs `node S:/SwarmMind/scripts/heartbeat.js --lane swarmmind --once`
- `SwarmMindWatcher` - runs `S:/SwarmMind/scripts/inbox-watcher.ps1`

Watcher pipeline:

1. `lane-worker.js --lane <lane> --apply`
2. `generic-task-executor.js <lane> --apply`
3. `relay-daemon.js --apply`
4. For SwarmMind, `codex-wake-packet.js --apply`

Wake packet:

`S:/SwarmMind/lanes/swarmmind/state/codex-wake-packet.json`

Purpose:

- Records SwarmMind inbox/action-required items likely needing Codex-level reasoning.
- Gives active Codex sessions a stable resume entry point.
- Can signal Archivist when pending Codex-required work exists.

Important boundary:

The watcher closes the visibility/routing gap. It does not create a Codex reasoning session when the app is inactive.

Health checks:

```powershell
Get-ScheduledTaskInfo -TaskName SwarmMindHeartbeat
Get-ScheduledTaskInfo -TaskName SwarmMindWatcher
Get-Content S:/SwarmMind/scripts/inbox-watcher.log -Tail 80
node S:/SwarmMind/scripts/codex-wake-packet.js
```

Expected:

- `SwarmMindHeartbeat` last result `0`
- `SwarmMindWatcher` may show scheduler state `267009` while running
- `heartbeat-swarmmind.json` should update in place

---

## Tests And Review Commands

Core checks:

```powershell
node scripts/test-lane-worker-we4free.js
node scripts/test-executor-v3.js
node S:/Archivist-Agent/scripts/sync-all-lanes.js --dry-run
```

Expected baseline:

- lane-worker: 17/17 pass
- executor: 64/64 pass
- sync-all-lanes: 4/4 lanes pass tests, 4/4 healthy

If a test fails once but passes immediately on rerun, report it as a transient with both outputs. Do not hide the first failure.

---

## Cross-Lane Sync Protocol

Primary tool:

`S:/Archivist-Agent/scripts/sync-all-lanes.js`

Use cases:

- Validate shared scripts match across lanes.
- Propagate canonical fixes.
- Detect/repair drift.

Real drift validation artifact:

`lanes/broadcast/sync-all-lanes-drift-test.json`

Audit artifact:

`S:/Archivist-Agent/scripts/sync-all-lanes-audit.md`

Rules:

- Run `--dry-run` before real sync when worktrees are dirty.
- Read the sync report before claiming success.
- Be aware canonical selection is currently mtime-based.
- Real sync can propagate changes across Archivist, SwarmMind, Kernel, and Library.

---

## Git Protocol

Do not claim durable completion unless changes are committed and pushed, or explicitly state they are local-only.

Before commit/push:

1. Run `git status --short`.
2. Separate user/pre-existing changes from your changes.
3. Check for secrets.
4. Stage only intended files.
5. Commit and push as one action when asked to finalize.
6. Verify remote state.

Do not revert unrelated dirty work.

---

## SwarmMind Lane Identity

Role: optimization, synchronization, robustness audit, and cross-lane consistency surface.

Primary duties:

- Validate tools with real drift/failure scenarios.
- Audit automation robustness.
- Detect path, trust, and protocol drift.
- Report concise findings with evidence.
- Help Archivist coordinate without inventing authority.

Constraints:

- Do not mutate governance policy unilaterally.
- Do not use deprecated SwarmMind paths.
- Do not assert cross-lane completion without evidence.
- Do not hide blocked/quarantined items; summarize them when relevant.
- Prefer runtime checks over static assumptions.

---

## Learned User Preferences

- User values precise, evidence-backed corrections when assumptions are wrong and wants the factual model explicitly restated.
- User prefers lane-scoped operation: SwarmMind should work from local lane inbox/entry points rather than assumed shared context.
- User is comfortable using SwarmMind as an on-demand Archivist subagent when SwarmMind is not otherwise active.

## Learned Workspace Facts

- Incremental memory index path for this workspace is `S:/SwarmMind/.cursor/hooks/state/continual-learning-index.json`.
- SwarmMind canonical path is `S:/SwarmMind`.
- Deprecated long SwarmMind path must not be used.
- `createSignedMessage()` supports unencrypted keys; passphrase is optional after the local fix that removed the dead throw path.
- `codex-wake-packet.js` records pending Codex-required work at `lanes/swarmmind/state/codex-wake-packet.json`.

