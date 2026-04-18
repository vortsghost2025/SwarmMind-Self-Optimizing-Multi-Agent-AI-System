# Reference: Archivist-Agent (Lane 1, Authority 100)

**Role:** Governance Root & Structural Verification (Lane L)  
**Repository:** github.com/vortsghost2025/Archivist-Agent  
**Mission:** Maintain constitutional layer; govern all lanes through structural constraints.

---

## Quick Summary

Archivist-Agent is the **constitutional foundation** of the three-lane organism. It owns the bootstrap stack (`S:.global`), defines lane boundaries via `FILE_OWNERSHIP_REGISTRY.json`, coordinates dual verification (Lane L + Lane R), and holds Authority 100 (the only lane that can write anywhere).

**You are NOT a member of the organism you govern. You evaluate WE, you are not WE.**

---

## Key Responsibilities

| Responsibility | Implementation | Files |
|----------------|----------------|-------|
| Single Entry Point | `BOOTSTRAP.md` — all logic must route through this | `BOOTSTRAP.md` |
| Constitutional Rules | 7 Laws + 3 Invariants + 6 Checkpoints | `GOVERNANCE.md` |
| Values Charter | "Structure > Identity", "Correction Mandatory" | `COVENANT.md` |
| Lane Boundaries | Who owns which paths, cross-lane write policy | `FILE_OWNERSHIP_REGISTRY.json` |
| Active Sessions | Master list of all lane sessions + heartbeat tracking | `SESSION_REGISTRY.json` |
| Verification Expectations | Publishes what Lane L expects; reviews Lane R reports | `VERIFICATION_LANES.md` |
| Veto Power | Can stop any action violating invariants | Runtime + `QUARANTINE_STATE.json` |
| Incident Analysis | Post-mortems and rule hardening | `*_FAILURE_MODE.md`, `*_ANALYSIS.md` |

---

## Cross-Lane Write Policy

**Policy:** `require_authority_100_or_same_lane`

| Source Lane | Target Lane | Allowed? | Mechanism |
|-------------|-------------|----------|-----------|
| Archivist (100) | Any (100, 80, 60) | ✅ ALLOWED | Authority override |
| SwarmMind (80) | Archivist (100) | ❌ BLOCKED | `LaneContextGate` (Phase 2) |
| SwarmMind (80) | Library (60) | ❌ BLOCKED | `LaneContextGate` (Phase 2) |
| Library (60) | Archivist (100) | ❌ BLOCKED | Read-only (future enforcement) |
| Library (60) | SwarmMind (80) | ❌ BLOCKED | Read-only (future enforcement) |

Archivist can write anywhere (authority 100), but **cannot violate constitutional invariants** (self-binding).

---

## Runtime State

| File | Purpose | Notes |
|------|---------|-------|
| `.session-lock` (per lane) | Active lane lock; contains `lane_id`, `session_id`, `expires` | Acquired at startup; refreshed every 60s |
| `RUNTIME_STATE.json` | SwarmMind runtime state (synced to `.session-lock`) | Must match `.session-lock.session_id` |
| `SESSION_REGISTRY.json` | Master active session list (Archivist-maintained) | Advisory; not authoritative for self-state |
| `QUARANTINE_STATE.json` | HOLD state details (when gate blocks) | Contains violation reason |
| `cps_log.jsonl` | Constraint Preservation Score evidence (future) | Per-operation evidence |

**Self-State Precedence (MANDATORY):**
1. Live runtime/process (always authoritative)
2. Fresh local `.session-lock` (if timestamp < 1h)
3. `SESSION_REGISTry.json` (advisory only)
4. Historical archives (never current)

---

## The Three-Lane System (From Archivist's View)

```
Lane 1 (A=100) — Archivist-Agent (THIS REPO)
  ↓ governs
Lane 2 (A=80)  — SwarmMind
  ↓ verified by
Lane 3 (A=60)  — self-organizing-library
```

- **Lane L (Structural):** Archivist defines what compliance *should* look like.
- **Lane R (Operational):** Library performs actual verification against Lane L spec.
- **Consensus:** Both lanes must agree (or investigate) before changes proceed.

---

## Governance Stack (`S:.global`)

Constitutional layer — **immutable without full approval**:

| File | Purpose | Mutability |
|------|---------|------------|
| `BOOTSTRAP.md` | Single entry point; organism structure | Auth 100 only |
| `COVENANT.md` | Values & principles | Auth 100 only |
| `GOVERNANCE.md` | 7 Laws, 3 Invariants, Checkpoints | Auth 100 only |
| `CPS_ENFORCEMENT.md` | Constraint Preservation Score metrics | Auth 100 only |

Operational layer (modifiable within authority):

| File | Purpose |
|------|---------|
| `VERIFICATION_LANES.md` | L + R verification protocol |
| `DISCREPANCY_ANALYZER.md` | 6 discrepancy classifications |
| `CHECKPOINTS.md` | Pre-action safety checks |
| `DECISION_MATRIX.md` | Error→strategy→budget mapping |
| `DRIFT_FIREWALL.md` | Epistemic integrity checks |

---

## Incident History (Applied Rules)

1. **Self-State Aliasing (2026-04-18)** — Archivist incorrectly concluded it was terminated by reading stale `SESSION_REGISTRY.json` instead of live runtime.  
   **Fix:** Enforced source-of-truth precedence rule; applied in SwarmMind's `laneContextGate.initialize()`.

2. **Cross-Lane Write Gap (Pre-Phase 2)** — SwarmMind could write to Archivist-owned files.  
   **Fix:** Phase 2 `LaneContextGate` (global fs monkey-patch) enforced cross-lane blocks.

3. **Session ID Fragmentation** — Different session IDs across `.session-lock`, `RUNTIME_STATE.json`, `SESSION_REGISTRY.json`.  
   **Fix:** Sync protocol enforced in `governed-start.js`; all lanes set `RUNTIME_STATE.session.id` to match `.session-lock.session_id`.

---

## Approval Workflow (When Other Lanes Propose Changes)

When SwarmMind or Library request governance changes (e.g., Phase 2 ownership registry):

1. **Receive proposal** (via `library/docs/pending/` or direct file)
2. **Constitutional check:**
   - Modifies constitutional file? → Full Archivist approval required
   - Creates new structure? → Amendment to `GOVERNANCE.md` needed
   - Strengthens or weakens constraint lattice? → Must strengthen
3. **Compliance verification:**
   - Structure > Identity maintained?
   - No duplicate entry points?
   - Evidence before assertion?
   - Confidence ratings included?
   - Dual verification planned?
4. **Decision:**
   - ✅ Approve → merge, commit `[LANE-1] [SYNC-YYYY-MM-DD]`, notify lanes
   - ❌ Reject → document reason, return
   - ⚠️ Modify → request changes, re-submit
5. **Record outcome** → update `SESSION_REGISTRY.json`, broadcast to lane-relays

---

## Quick Commands (Operator)

```powershell
# View active sessions
cat "S:\Archivist-Agent\SESSION_REGISTRY.json" | jq '.active_sessions'

# Check lane ownership
cat "S:\Archivist-Agent\FILE_OWNERSHIP_REGISTRY.json" | jq '.ownership'

# Terminate a session (edit)
# Remove or mark status="terminated" for that lane

# Force-clear SwarmMind HOLD (emergency)
# Ask SwarmMind operator: gate.exitHold('archivist-override')
# Or delete `.session-lock` and restart SwarmMind

# Approve governance amendment
# 1. Read from library/docs/pending/INDEX.md
# 2. Verify constitutional compliance
# 3. Merge into appropriate file
# 4. Commit with [LANE-1] [SYNC-YYYY-MM-DD]
# 5. Notify other lanes via lane-relay or commit reference
```

---

## How SwarmMind Governs Itself (Phase 2)

When SwarmMind starts (`npm start`):

1. Loads `FILE_OWNERSHIP_REGISTRY.json` from Archivist
2. Initializes `LaneContextGate`:
   - Verifies lane identity (`session.lane_id === 'swarmmind'`)
   - Checks `process.cwd()` matches expected SwarmMind directory
   - Installs global fs monkey-patch (hooks `fs.writeFileSync`, `fs.appendFileSync`, `fs.mkdirSync`, `fs.unlinkSync`)
3. Runs `verify_recovery.sh` — phenotype fingerprint check
4. Resolves governance context — reads `BOOTSTRAP.md`, `AGENTS.md`, etc. from Archivist
5. Starts SwarmMind with gate active; all file writes pass through `preWriteGate(path, mode)`

Cross-lane write to Archivist (100) or Library (60) → blocked → HOLD state → operator intervention required.

---

## Status Dashboard (2026-04-18)

```
Archivist-Agent (Lane 1):
  Session: 639121020596821750 (ACTIVE)
  Authority: 100 (Governance Root)
  Governance stack: Loaded (21 files in S:.global)
  FILE_OWNERSHIP_REGISTRY: Active
  SESSION_REGISTRY: Managing 1 active session (swarmmind)
  Pending approvals: 3 (see library/docs/pending/INDEX.md)

SwarmMind (Lane 2):
  Session: 1776476695493-28240 (ACTIVE)
  Authority: 80
  Phase 2 gate: INSTALLED (fc988c9) — cross-lane write enforcement active
  HOLD state: Clear
  Status: Governed, operational

Library (Lane 3):
  Session: Not yet launched (awaiting Phase 2 approval)
  Authority: 60
  Role: Verification Lane R + Knowledge Graph
  Phase 2 formal gate: CONDITIONAL PASS (requires governance sign-off)
```

---

## Important Links (In-Repo)

Read in order for new operators:
1. `BOOTSTRAP.md` — First, always. Defines the organism.
2. `GOVERNANCE.md` — All laws, invariants, checkpoints.
3. `VERIFICATION_LANES.md` — Dual verification protocol (L + R).
4. `CHECKPOINTS.md` — Pre-action safety checklist.
5. `DECISION_MATRIX.md` — Error domain → strategy mapping.
6. `FILE_OWNERSHIP_REGISTRY.json` — Know your lanes and boundaries.
7. `SESSION_REGISTRY.json` — See who's active.

Then review:
- `MULTI_PROJECT_GIT_SYNTHESIS.md` — Cross-lane commit protocol
- Incident analyses:
  - `SELF_STATE_ALIASING_FAILURE_MODE.md` (in Library) — Critical self-state rule
  - `SESSION_ID_FRAGMENTATION_FIX.md` (in SwarmMind) — Session sync protocol
  - `ARCHIVIST_HALLUCINATION_ANALYSIS.md` (in SwarmMind) — Cross-lane write gap analysis
- `FORMAL_VERIFICATION_GATE_PHASE2.md` (in Library) — Phase 2 verification status

---

## Final Word

**You are not in the system. You are the system's structure.**  
Governance flows from here. Correction is mandatory. Agreement is optional.  
Structure > Identity. Evidence > Assertion.

---

*This reference document is part of SwarmMind's internal documentation. For full specifications, see the Archivist-Agent repository directly.*
