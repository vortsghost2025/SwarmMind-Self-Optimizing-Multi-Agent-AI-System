```
OUTPUT_PROVENANCE: agent: kilo/z-ai/glm-5.1 lane: swarmmind target: SWARMMIND_OFFLINE_PRODUCTIVITY_PLAN.md generated_at: 2026-05-19T03:30:00Z session_id: swarm-offline-phase1
```

# SwarmMind Offline Productivity Plan

## 1. Problem Statement

SwarmMind currently has weak offline autonomous output. Its watcher routes mail, runs bounded generic tasks, relays messages, and generates wake packets — but does not instantiate a reasoning session when inactive. When no one gives it a drift problem, a sync issue, a robustness audit, or a queue of verification tasks, it has little to do. The watcher closes the visibility/routing gap but does not create a Codex reasoning session when the app is inactive. This means SwarmMind — the lane whose identity is optimization, audit, synchronization, and cross-lane robustness — sits idle during the majority of its scheduled runtime, producing no artifacts, no findings, and no enrichment for future live sessions.

The core insight: there is a large category of work that is deterministic, safe, requires no model, and is squarely within SwarmMind's lane identity. Today, none of that work runs automatically.

---

## 2. Two Offline Modes

### Mode A — Deterministic Offline Worker

Runs constantly, safely, no model needed. This is the Phase 1 build.

- Scan `inbox/` and `action-required/`
- Classify messages by priority and type
- Run bounded generic tasks (existing executor)
- Route outbox
- Generate Codex/Kilo wake packets
- Run sync/drift checks across all 4 lanes
- Produce "operator-ready next work" packets
- Execute standing duties S1–S4 deterministically
- Perform deterministic enrichment of wake packets (S5 partial)

Mode A is implemented by `swarm-offline-runner.js` and wired into the existing `inbox-watcher.ps1` pipeline. It uses the same execution boundary as the current watcher — no model, no reasoning session, no open-ended generation.

### Mode B — True Overnight Swarm Agent

Requires a scheduled headless reasoning session. This is Phase 2 — DO NOT IMPLEMENT YET.

- Headless scheduled Kilo/NIM/OpenCode session
- Bounded Swarm night queue (`swarm-night-queue.json`)
- Task packets selected for Swarm's lane identity (drift analysis, robustness recommendations, cross-lane synchronization proposals)
- `requireOutput` / evidence gates on every work unit
- Consumes only items where `requires_model=true` in the night queue
- Must produce a verified artifact, not chat-only completion
- Work units tracked separately from monitor loops

---

## 3. Five Standing Offline Duties

### S1: Cross-Lane Drift Sweep

Daily compare canonical scripts across 4 lanes. Detect mismatches. Classify as `BENIGN`, `NEEDS_SYNC`, or `RISK`. Write evidence report.

- Compare shared scripts: `lane-worker.js`, `generic-task-executor.js`, `relay-daemon.js`, `create-signed-message.js`, etc.
- Use `sync-all-lanes.js --dry-run` output as primary evidence source
- Classify drift severity:
  - `BENIGN`: whitespace or comment differences
  - `NEEDS_SYNC`: functional logic differs but no data loss risk
  - `RISK`: trust-store, identity, or governance file drift
- Write report to `reports/swarm/drift-sweep-{date}.md`
- If `RISK` found, escalate via outbox to Archivist as P0

### S2: Watcher/Heartbeat Health Audit

Check SwarmMindHeartbeat, SwarmMindWatcher, watcher log tail, wake packet freshness, skipped lanes.

- `Get-ScheduledTaskInfo -TaskName SwarmMindHeartbeat` — expect last result `0`
- `Get-ScheduledTaskInfo -TaskName SwarmMindWatcher` — expect running or `267009` while active
- `Get-Content scripts/inbox-watcher.log -Tail 80` — check for repeated errors
- `codex-wake-packet.js` — verify wake packet is not stale (updated within last 30 minutes of watcher activity)
- Check `heartbeat-swarmmind.json` update timestamp
- Verify no lanes skipped in last sync cycle
- Write report to `reports/swarm/health-audit-{date}.md`

### S3: Robustness Regression Scan

Look for repeated `action-required/` items, relay failures, messages stuck in `processed/` inconsistently, unsigned or unproven outbox items, repeated executor failures.

- Scan `action-required/` for items with duplicate `task_id` or repeated `retry.attempt > 2`
- Check `processed/` for messages missing `convergence_gate` or with `status: "unproven"`
- Scan outbox for unsigned messages (no `evidence.verified: true`)
- Check executor logs for repeated failures on the same task kind
- Classify findings: transient (single occurrence) vs. systematic (3+ occurrences)
- Write report to `reports/swarm/robustness-scan-{date}.md`
- Escalate systematic findings to Archivist

### S4: Cross-Lane Stale-Work Detection

Identify inbox tasks older than threshold, blocked/quarantine items not revisited, outbox responses not delivered, requests without convergence gate.

- Threshold: inbox items older than 24 hours with no `lease` renewal
- Blocked/quarantine items not revisited in 48 hours
- Outbox responses older than 12 hours with no delivery acknowledgment
- Requests missing `convergence_gate` entirely
- Cross-reference with other lane inboxes to detect orphaned handoffs
- Write report to `reports/swarm/stale-work-{date}.md`
- Escalate items older than 48 hours as P1 to Archivist

### S5: Wake-Packet Enrichment

Leave best possible prompt for next live agent: prioritized task list, why each matters, evidence locations, recommended first command, whether work is safe/autonomous or needs operator.

- **Deterministic enrichment** (Mode A): append findings from S1–S4 to wake packet, add priority ordering, link evidence artifacts, flag items safe for autonomous execution vs. needing operator
- **Deep enrichment** (Mode B): use model to synthesize findings, propose remediation steps, draft convergence gate claims for operator review, suggest specific Kilo/OpenCode commands to run next
- Update `lanes/swarmmind/state/codex-wake-packet.json`
- Include: `offline_findings_summary`, `recommended_first_command`, `safe_autonomous_work_available`, `escalated_items`

---

## 4. Duty Classification

| Duty | safe_offline_no_model | requires_live_model | requires_operator |
|------|----------------------|--------------------|--------------------|
| S1: Drift sweep | YES | no | no |
| S2: Health audit | YES | no | no |
| S3: Robustness scan | YES | no | no (escalate findings) |
| S4: Stale-work detection | YES | no | no (escalate findings) |
| S5: Wake-packet enrichment | partial (deterministic enrichment) | YES (deep enrichment) | no |

Key boundary: S1–S4 are fully deterministic and safe to run without any model. S5 deterministic enrichment (appending structured findings, evidence paths, priority flags) is also safe. S5 deep enrichment (synthesizing recommendations, drafting remediation) requires a live model and is deferred to Phase 2.

---

## 5. Night Queue Architecture

`swarm-night-queue.json` is separate from inbox mail. It is authorized standing work, not external requests.

### Queue Item Schema

```json
{
  "id": "s1-drift-sweep-daily",
  "task_kind": "drift_sweep",
  "priority": "P2",
  "safe_offline": true,
  "requires_model": false,
  "executor": "swarm-offline-runner",
  "expected_artifact": "reports/swarm/drift-sweep-{date}.md",
  "schedule_hint": "daily",
  "max_duration_seconds": 300,
  "last_run_at": null,
  "last_result": null,
  "enabled": true
}
```

### Queue Rules

- Items where `requires_model=true` are only consumed when a headless Kilo/NIM session is active (Phase 2)
- Items where `safe_offline=true` and `requires_model=false` are consumed by `swarm-offline-runner.js` on every watcher cycle
- The night queue is not a replacement for inbox mail — it is standing authorized work
- Queue items are idempotent: re-running produces a fresh artifact, does not duplicate findings
- Failed items set `last_result` to the error and remain `enabled` for next cycle
- Items disabled by operator must include a `disabled_reason` field

---

## 6. Telemetry Fields

| Metric | Meaning |
|--------|---------|
| `offline_checks_run` | deterministic scans actually performed |
| `drift_findings_created` | problems detected by S1 |
| `wake_packets_enriched` | future live sessions made easier by S5 |
| `stale_items_escalated` | silent rot prevented by S4 |
| `executor_tasks_completed` | bounded work actually done |
| `model_required_work_queued` | valuable work identified but deferred (Phase 2 counter) |

Telemetry is written to `lanes/swarmmind/state/offline-telemetry.json` and incremented by `swarm-offline-runner.js` after each duty cycle. Values are cumulative within a calendar day and reset at midnight UTC.

---

## 7. Executor Extension Recommendation

Add 3 deterministic offline task kinds to `generic-task-executor.js` NOW:

### `drift_sweep`

Compare canonical scripts across 4 lanes.

- Inputs: lane paths from `lane-registry.json`
- Process: run `sync-all-lanes.js --dry-run`, parse output, classify findings
- Output: `reports/swarm/drift-sweep-{date}.md`
- Max duration: 300 seconds
- Safe offline: yes

### `watcher_health_audit`

Check scheduled task state, heartbeat freshness, watcher log.

- Inputs: task names, log paths, heartbeat path
- Process: `Get-ScheduledTaskInfo`, log tail, timestamp checks
- Output: `reports/swarm/health-audit-{date}.md`
- Max duration: 120 seconds
- Safe offline: yes

### `stale_work_detection`

Scan all lanes for aged inbox items, unvisited blocked/quarantine, undelivered outbox.

- Inputs: lane inbox/outbox paths from registry
- Process: directory listing, timestamp comparison, convergence gate check
- Output: `reports/swarm/stale-work-{date}.md`
- Max duration: 180 seconds
- Safe offline: yes

These are `safe_offline_no_model` and can be dispatched by `swarm-offline-runner.js`.

---

## 8. Phase 1 Build

Cheap, immediate, no philosophical risk. All work is deterministic, bounded, and within existing watcher boundaries.

### Deliverables

| File | Purpose |
|------|---------|
| `SWARMMIND_OFFLINE_PRODUCTIVITY_PLAN.md` | This file. Master plan. |
| `SWARMMIND_STANDING_DUTIES.md` | Concise duty reference for the runner and future operators |
| `swarm-night-queue.schema.json` | JSON Schema for night queue items |
| `swarm-night-queue.example.json` | Initial queue with all 5 duties |
| `swarm-offline-runner.js` | New script that runs standing duties deterministically |
| `generic-task-executor.js` (modified) | 3 new task kinds: `drift_sweep`, `watcher_health_audit`, `stale_work_detection` |
| `inbox-watcher.ps1` (modified) | Wire `swarm-offline-runner.js` into watcher pipeline |
| `reports/swarm/` | Directory for daily readiness reports |

### Wiring

```
inbox-watcher.ps1
  └─> lane-worker.js --lane swarmmind --apply
  └─> generic-task-executor.js swarmmind --apply
  └─> relay-daemon.js --apply
  └─> codex-wake-packet.js --apply
  └─> swarm-offline-runner.js --apply          <-- NEW
       └─> S1: drift_sweep
       └─> S2: watcher_health_audit
       └─> S3: robustness_regression_scan
       └─> S4: stale_work_detection
       └─> S5: wake_packet_enrichment (deterministic only)
       └─> emit: reports/swarm/SWARM_OFFLINE_READINESS_REPORT.md
```

### Daily Readiness Report

`reports/swarm/SWARM_OFFLINE_READINESS_REPORT.md` is emitted once per duty cycle. It contains:

- Timestamp of last run
- Per-duty pass/fail status
- Count of findings per duty
- Telemetry counters
- Top 3 recommended next actions for live operator
- Whether any items were escalated
- Whether any `requires_model` work was identified but deferred

---

## 9. Phase 2 — True Autonomous Headless Swarm

**DO NOT IMPLEMENT YET.**

- Add scheduled Kilo/OpenCode/NIM wake run
- Let it consume one `requires_model=true` work packet from `swarm-night-queue.json`
- Require verified artifact, not chat-only completion
- Track work units separately from monitor loops
- S5 deep enrichment becomes available
- Model-backed tasks get their own telemetry: `model_sessions_run`, `model_artifacts_produced`, `model_work_deferred`

Phase 2 is gated on: stable Phase 1 operation for at least 7 consecutive days, operator approval, and a proven headless session harness that enforces evidence gates.

---

## 10. Pass/Fail Criteria for Phase 1

### PASS

- `swarm-offline-runner.js` runs all 5 standing duties without error
- At least 1 drift finding or health observation produced as artifact
- Daily readiness report written to `reports/swarm/`
- Wake packet enriched with offline findings
- No governance violations (no writes to `trust-store.json`, `BOOTSTRAP.md`, `AGENTS.md`)
- Telemetry counters incremented for each duty run

### FAIL

- Runner crashes or produces unsigned/unproven output
- Runner writes to protected governance files
- Runner attempts model-backed work (Phase 2 boundary violation)
- Runner produces no artifacts across 3 consecutive cycles
- Runner modifies `lane-registry.json` or `trust-store.json`
- Telemetry counters remain at zero after a full cycle

---

## 11. Constraints

- **Do not implement the night agent (Phase 2) yet.** This plan explicitly gates Phase 2 behind operator approval and 7 days of stable Phase 1.
- **Do not broaden into Archivist or Library redesign.** SwarmMind's standing duties are lane-scoped. Cross-lane findings are escalated, not unilaterally resolved.
- **Preserve the existing watcher boundary.** Deterministic offline work vs. model-backed reasoning work must remain clearly separated. The runner does not reason; it scans, classifies, and reports.
- **All output must include OUTPUT_PROVENANCE.** Every artifact, report, and outbox message produced by the runner carries full provenance.
- **No writes to governance files.** The runner may read `trust-store.json`, `lane-registry.json`, and `BOOTSTRAP.md` but must never modify them.
- **Idempotency.** Re-running a duty produces a fresh artifact for the current date. It does not duplicate or overwrite previous days' findings.
- **Evidence-first, assertion-second.** Every finding in every report links to the concrete evidence (file path, log line, sync output) that supports it. No bare claims.
