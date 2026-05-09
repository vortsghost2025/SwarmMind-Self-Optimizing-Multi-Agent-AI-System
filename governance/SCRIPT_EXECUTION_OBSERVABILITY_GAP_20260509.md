# Script Execution Observability Gap Assessment

**OUTPUT_PROVENANCE:**
- agent: z-ai/glm5
- lane: swarmmind
- target: SCRIPT_EXECUTION_OBSERVABILITY_GAP analysis and remediation spec
- generated_at: 2026-05-09T04:00:00Z
- session_id: swarmmind-observability-gap-20260509

---

## Gap Confirmation: PROVEN

### Evidence

| Source | Path | Contains SCRIPT_EXECUTED? | Contains Any Execution Trace? |
|--------|------|--------------------------|-------------------------------|
| SwarmMind audit.log | `audit/audit.log` | NO | NO (only continuity/recovery events) |
| SwarmMind journal | `lanes/swarmmind/journal/2026-05-08.jsonl` | NO (0 matches) | Partial — `work_started`/`work_completed` with agent names, but no script identity |
| SwarmMind traces | `lanes/swarmmind/state/traces/` | NO | 1 trace file — constraint evaluations only, no script exec |
| Broadcast journal | `lanes/broadcast/journal/SNAPSHOT.json` | NO | Activity snapshot by lane, no script granularity |
| Trust store | `lanes/broadcast/trust-store.json` | N/A | Identity keys only |

### What The Journal DOES Capture

The `store-journal.js` system records:
- `work_started` / `work_completed` events
- Agent attribution (agent name, lane, session_id)
- Git hook events (pre-commit, post-commit with commit SHA)
- Files changed per commit
- Active ownership claims

### What The Journal CANNOT Prove

- Which script was invoked (only git hook agent names like `git-pre-commit`)
- Script exit codes
- Script execution duration
- Whether a script mutated files (vs. read-only)
- Which lane invoked which script
- Frequency of script usage
- Script failure patterns

---

## SwarmMind Stance

1. **No retroactive filling** — agree completely. Fabricated historical data is worse than no data.
2. **Previous claims retracted** — the 577 audit events / 982 executions / per-agent counts cannot be verified from current sources. They must be treated as unproven.
3. **Forward-looking only** — only events emitted AFTER instrumentation is deployed are valid.

---

## Recommended SCRIPT_EXECUTED Event Schema

```json
{
  "event": "SCRIPT_EXECUTED",
  "timestamp": "ISO-8601",
  "agent": "archivist|kernel|library|swarmmind|authority|unknown",
  "lane": "active lane context",
  "host": "hostname",
  "repository": "repo path",
  "script": "relative path from repo root",
  "argv_redacted": "sanitized command arguments",
  "cwd": "working directory at execution",
  "exit_code": 0,
  "duration_ms": 150,
  "mutation_performed": false,
  "output_artifact": "path to generated output if any",
  "session_id": "current session context",
  "trust_level": "verified|unverified|failed"
}
```

### Implementation Approach

**Option A: Wrapper Script** — Create `scripts/run-logged.js` that wraps any script invocation:
```bash
node scripts/run-logged.js scripts/task-executor.js --lane swarmmind
```
This wrapper emits a `SCRIPT_EXECUTED` event to the lane journal before and after execution.

**Option B: Git Hook Integration** — Extend `post-commit-hook.sh` to parse commit messages for script references and emit `SCRIPT_EXECUTED` events retroactively from git history. **Rejected** — violates the no-retroactive-filling rule.

**Option C: Process Monitor** — Daemon that watches `node scripts/*.js` process spawns. Fragile and platform-dependent. **Not recommended** for initial implementation.

**Recommended: Option A** — wrapper script with journal integration. Simple, opt-in, forward-looking.

---

## Dependencies On Convergence Vote

This observability gap directly relates to the SHARED_SCRIPT_OWNERSHIP convergence proposal:

- **S2 (lane_constants_correct guard)** cannot be enforced without knowing which scripts run and what they do
- **Batch 3 (Sync Guard)** verification checks need execution evidence to confirm no regressions
- **Script reliability metrics** require execution counts per script per lane

**Recommendation:** Implement SCRIPT_EXECUTED logging AFTER convergence ratification, as part of Batch 3 (Sync Guard verification layer).

---

## Convergence Gate

```json
{
  "claim": "Script execution observability gap confirmed — 0 SCRIPT_EXECUTED events exist in any lane journal or audit log. Current journal captures work_started/completed and git hooks but cannot prove script identity, exit codes, duration, or mutation status.",
  "evidence": "S:/SwarmMind/lanes/swarmmind/journal/2026-05-08.jsonl (0 SCRIPT_EXECUTED matches), S:/SwarmMind/audit/audit.log (no execution events), S:/SwarmMind/lanes/swarmmind/state/traces/ (1 trace, constraint evals only)",
  "verified_by": "swarmmind",
  "contradictions": [],
  "status": "proven"
}
```
