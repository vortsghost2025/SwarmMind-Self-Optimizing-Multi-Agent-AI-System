OUTPUT_PROVENANCE:
  agent: kilo/z-ai/glm-5.1
  lane: swarmmind
  target: SWARMMIND_STANDING_DUTIES.md
  generated_at: 2026-05-19T03:30:00Z
  session_id: swarm-offline-phase1

# SwarmMind Standing Offline Duties

Operational companion to `SWARMMIND_OFFLINE_PRODUCTIVITY_PLAN.md`.

## 1. Purpose

Define standing duties SwarmMind performs offline, aligned with its lane
identity: optimization, synchronization, robustness audit, and cross-lane
consistency.

## 2. Authority

These duties are authorized by SwarmMind lane governance.

- They do **not** require operator approval per invocation.
- They do **not** mutate governance policy.
- They do **not** write to protected files (`trust-store.json`,
  `BOOTSTRAP.md`, `AGENTS.md`, or any governance file).

## 3. Duty Catalog

---

### S1 — Cross-lane drift sweep

| Field              | Value                            |
|--------------------|----------------------------------|
| ID                 | `swarm-duty-drift-sweep`         |
| Purpose            | Detect script/config mismatches across the four canonical lanes |
| Classification     | `safe_offline_no_model`          |
| Schedule           | daily                            |
| Inputs             | `CANONICAL_SCRIPT_REGISTRY.json`, script files in each lane root |
| Outputs            | `reports/swarm/drift-sweep-YYYY-MM-DD.md` |
| Max duration       | 10 minutes                       |
| Idempotency        | Re-running on the same day overwrites the report; findings are identical if files unchanged |

#### Procedure

```
1. Read CANONICAL_SCRIPT_REGISTRY.json from S:/SwarmMind/scripts/
2. FOR each canonical script listed in the registry:
     a. Compute SHA256 of the script in each of the 4 lane roots
        (Archivist, Kernel, Library, SwarmMind)
     b. Compare hashes across lanes
     c. Classify any mismatch:
        - BENIGN      : whitespace / formatting only
        - NEEDS_SYNC  : real content diff
        - RISK        : governance- or trust-related diff
3. Write markdown report with findings table:
   | script | lane_a_hash | lane_b_hash | classification |
4. IF any RISK findings:
     ESCALATE to Archivist as P1
5. UPDATE telemetry: drift_findings_created += count of findings
```

#### Escalation rules

- **RISK** classification → escalate to Archivist as **P1** with evidence
  path pointing to the generated report.
- **NEEDS_SYNC** with no RISK → include in report; no escalation.

#### Expected artifact path

```
reports/swarm/drift-sweep-YYYY-MM-DD.md
```

---

### S2 — Watcher/heartbeat health audit

| Field              | Value                            |
|--------------------|----------------------------------|
| ID                 | `swarm-duty-watcher-health`      |
| Purpose            | Verify scheduled tasks, heartbeat freshness, and watcher pipeline health |
| Classification     | `safe_offline_no_model`          |
| Schedule           | every 4 hours                    |
| Inputs             | scheduled task state, `heartbeat-swarmmind.json`, `inbox-watcher.log`, `codex-wake-packet.json`, `agent-active.lock` |
| Outputs            | `reports/swarm/watcher-health-YYYY-MM-DD.md` |
| Max duration       | 5 minutes                        |
| Idempotency        | Re-running within the same 4-hour window overwrites the report; check results are re-evaluated from live state |

#### Procedure

```
1. Check SwarmMindHeartbeat scheduled task:
     - last result code
     - last run time
2. Check SwarmMindWatcher scheduled task:
     - last result code
     - last run time
3. Read heartbeat-swarmmind.json:
     - VERIFY timestamp within 15 minutes of now
4. Read inbox-watcher.log (tail 50 entries):
     - CHECK for ERROR lines
5. Read codex-wake-packet.json:
     - CHECK pending_count
     - CHECK generated_at freshness
6. Check agent-active.lock:
     - IF stale (>30 min old with no active process):
         FLAG it
7. Write markdown report with PASS / FAIL / WARN for each check
8. IF any FAIL:
     ESCALATE to Archivist as P1
9. UPDATE telemetry: offline_checks_run += 6
```

#### Escalation rules

- Any **FAIL** → escalate to Archivist as **P1**.
- Multiple **WARN** → note in report; no escalation unless combined with
  a FAIL.

#### Expected artifact path

```
reports/swarm/watcher-health-YYYY-MM-DD.md
```

---

### S3 — Robustness regression scan

| Field              | Value                            |
|--------------------|----------------------------------|
| ID                 | `swarm-duty-robustness-scan`     |
| Purpose            | Detect repeated failures, stuck messages, and unsigned output |
| Classification     | `safe_offline_no_model`          |
| Schedule           | daily                            |
| Inputs             | `inbox/processed/`, `inbox/blocked/`, `inbox/quarantine/`, `outbox/`, `worker-audit.log` |
| Outputs            | `reports/swarm/robustness-scan-YYYY-MM-DD.md` |
| Max duration       | 10 minutes                       |
| Idempotency        | Re-running on the same day produces the same severity ratings if input files unchanged |

#### Procedure

```
1. SCAN inbox/processed/ for items with execution_verified=false
2. SCAN inbox/blocked/ for items older than 24 hours not yet revisited
3. SCAN inbox/quarantine/ for items with FORMAT_VIOLATION or
   SCHEMA_INVALID that recur (same root cause >1 time)
4. SCAN outbox/ for unsigned messages (missing signature field)
5. SCAN outbox/ for messages without convergence_gate
   OR with convergence_gate.status != "proven"
6. CHECK worker-audit.log for repeated error patterns
   (same reason >3 times in 24h)
7. Write markdown report with severity ratings:
   - CRITICAL  : unsigned output, recurring schema violations
   - HIGH      : unverified execution, missing convergence gates
   - MEDIUM    : aged blocked items, repeated errors below threshold
   - LOW       : informational observations
8. IF any CRITICAL findings:
     ESCALATE to Archivist as P0
9. UPDATE telemetry: offline_checks_run += 6
```

#### Escalation rules

- **CRITICAL** findings → escalate to Archivist as **P0**.
- **HIGH** findings (without CRITICAL) → include in report; no automatic
  escalation but flag for next live session.

#### Expected artifact path

```
reports/swarm/robustness-scan-YYYY-MM-DD.md
```

---

### S4 — Cross-lane stale-work detection

| Field              | Value                            |
|--------------------|----------------------------------|
| ID                 | `swarm-duty-stale-work`          |
| Purpose            | Identify aging inbox items, unvisited blocked/quarantine, undelivered outbox, and requests without convergence gates across all 4 lanes |
| Classification     | `safe_offline_no_model`          |
| Schedule           | daily                            |
| Inputs             | All 4 lane `inbox/action-required/`, `blocked/`, `quarantine/`, `outbox/` directories |
| Outputs            | `reports/swarm/stale-work-YYYY-MM-DD.md` |
| Max duration       | 10 minutes                       |
| Idempotency        | Same-day re-run produces identical age buckets; report is overwritten |

#### Procedure

```
1. FOR each lane (archivist, kernel, library, swarmmind):
     a. SCAN inbox/action-required/ for items older than 12 hours
     b. SCAN blocked/ for items older than 24 hours
     c. SCAN quarantine/ for items older than 48 hours
     d. SCAN outbox/ for messages not yet delivered
        (no corresponding copy in target inbox or delivered/ marker)
     e. SCAN processed/ for items without convergence_gate
2. AGGREGATE findings by lane and age bucket:
     - 12h   : action-required aging
     - 24h   : blocked aging
     - 48h   : quarantine aging
     - 72h+  : any category beyond 72 hours
3. Write markdown report with per-lane summary table:
   | lane | 12h | 24h | 48h | 72h+ |
4. IF any 72h+ items found:
     ESCALATE to Archivist as P1
5. UPDATE telemetry: stale_items_escalated += count of 72h+ items
```

#### Escalation rules

- Any **72h+** items → escalate to Archivist as **P1**.
- 48h items without 72h+ → include in report; flag for next live session.

#### Expected artifact path

```
reports/swarm/stale-work-YYYY-MM-DD.md
```

---

### S5 — Wake-packet enrichment

| Field              | Value                            |
|--------------------|----------------------------------|
| ID                 | `swarm-duty-wake-enrichment`     |
| Purpose            | Upgrade the codex-wake-packet.json with prioritized task context for the next live agent session |
| Classification     | partial — deterministic enrichment is `safe_offline_no_model`; deep reasoning enrichment is `requires_live_model` |
| Schedule           | on watcher pass when idle        |
| Inputs             | `codex-wake-packet.json`, `inbox/action-required/`, `blocked/`, stale-work report, drift report, watcher-health report |
| Outputs            | Updated `codex-wake-packet.json` with enriched fields |
| Max duration       | 3 minutes                        |
| Idempotency        | Enrichment is additive; re-running with same input data produces the same enriched fields |

#### Procedure (deterministic part only)

```
1. READ current codex-wake-packet.json
2. FOR each pending item in the packet:
     a. ADD evidence_location: path to relevant file
     b. ADD recommended_first_command:
          e.g. "read S:/SwarmMind/lanes/swarmmind/inbox/blocked/..."
     c. ADD safe_autonomous:
          true  if task is safe_offline_no_model
          false if task is requires_live_model or requires_operator
3. ADD offline_findings section:
     - Summarize results from S1–S4 if reports exist
     - Key metrics: drift count, health pass/fail, critical findings,
       stale 72h+ count
4. ADD next_session_recommendation:
     - Identify which duty or inbox item to address first
     - Base priority on: P0 inbox > P1 inbox > CRITICAL robustness >
       RISK drift > stale 72h+
5. WRITE updated packet to codex-wake-packet.json
6. UPDATE telemetry: wake_packets_enriched += 1
```

#### Escalation rules

- No direct escalation from this duty.
- Enrichment surfaces escalation-worthy items already flagged by S1–S4.

#### Expected artifact path

```
lanes/swarmmind/state/codex-wake-packet.json
```

---

## 4. Telemetry Accumulator

**Location:** `S:/SwarmMind/lanes/swarmmind/state/offline-telemetry.json`

**Schema:**

```json
{
  "offline_checks_run": 0,
  "drift_findings_created": 0,
  "wake_packets_enriched": 0,
  "stale_items_escalated": 0,
  "executor_tasks_completed": 0,
  "model_required_work_queued": 0,
  "last_updated": "ISO-8601"
}
```

Each duty increments the relevant counter atomically. The `last_updated`
field is set to the current ISO-8601 timestamp on every write.

---

## 5. Constraints

1. **No duty writes to governance files.** Protected paths include but are
   not limited to: `trust-store.json`, `BOOTSTRAP.md`, `AGENTS.md`,
   `OUTPUT_PROVENANCE_CONTRACT.md`, `output-provenance.contract.json`.
2. **No duty instantiates a model or reasoning session.** Duties that
   require deep reasoning (partial classification) enqueue work for the
   next live session rather than attempting autonomous reasoning.
3. **All artifacts must include OUTPUT_PROVENANCE.** Every report file
   and updated packet must carry a valid provenance block.
4. **All escalation messages must use the standard lane message schema
   v1.3.** See `AGENTS.md` for the full schema shape.
5. **Duties are idempotent.** Running a duty twice with the same input
   state produces the same report (with updated timestamps). No
   duplicate escalation messages are sent for the same finding within
   the same duty cycle.
