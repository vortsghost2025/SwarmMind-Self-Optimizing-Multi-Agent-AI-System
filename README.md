# SwarmMind: Trace-Mediated Verification Surface (Lane 2)

**Operational Status:** ✅ Active — Isolated Interior Lattice-Constrained Verification Lane
**Authority:** 80 (Execution Layer)
**Governance Root:** [Archivist-Agent](https://github.com/vortsghost2025/Archivist-Agent) (Lane 1, Authority 100)
**Session ID:** Dynamic per run (tracked in `.session-lock`)
**Cross-Lane Policy:** `require_authority_100_or_same_lane` — enforced via `LaneContextGate` (Phase 2, commit `fc988c9`)

---

## START HERE

**What this repository is:**
- A multi-agent execution engine that runs inside the three-lane constitutional governance system
- Authority 80, governed by Archivist-Agent (Lane 1), verified by self-organizing-library (Lane 3)
- Implements cross-lane write enforcement via `LaneContextGate` (Phase 2, SPEC_AMENDMENT_LANE_CONTEXT_GATE)

**What this repository is NOT:**
- A standalone system operating without governance
- A project that can write to Archivist-Agent or Library files
- An agent that decides its own constraints — those come from BOOTSTRAP.md
- A demo/hackathon prototype — it's production governance code

**If you only read 3 files, read these:**
1. `README.md` (this file) — Understand the three-lane system from SwarmMind's perspective
2. `S:\Archivist-Agent\BOOTSTRAP.md` — The single entry point that defines everything
3. `S:\Archivist-Agent\FILE_OWNERSHIP_REGISTRY.json` — See which paths belong to which lane

**Quick 10-line example workflow:**
```
1. Operator runs: npm start
2. governed-start.js loads FILE_OWNERSHIP_REGISTRY.json from Archivist
3. LaneContextGate verifies lane identity (swarmmind, auth=80)
4. Global fs monkey-patch installed → all writes go through preWriteGate()
5. User submits task → Planner decomposes → Coder implements
6. Reviewer evaluates → Executor runs → Trace captured end-to-end
7. Result written to SwarmMind/output/ (same-lane → allowed)
8. Any attempt to write to S:\Archivist-Agent\ → ❌ BLOCKED → HOLD
9. Operator reviews HOLD reason in QUARANTINE_STATE.json
10. Operator calls gate.exitHold('operator-override') or fixes root cause
```

---

## Big Picture: The Three-Lane Architecture

SwarmMind is **Lane 2** of a three-lane verification organism:

```
┌────────────────────────────────────────────────────────────────────┐
│                     THREE-LANE VERIFICATION ORGANISM                │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Lane 1 (Authority 100) ──► [Archivist-Agent]                      │
│    github.com/vortsghost2025/Archivist-Agent                       │
│  Role: Governance Root & Structural Verification (Lane L)          │
│  - Maintains constitutional constraints (S:.global)               │
│  - Single entry point: BOOTSTRAP.md                               │
│  - Dual verification coordination (L + R lanes)                   │
│  - FILE_OWNERSHIP_REGISTRY.json defines lane boundaries           │
│                                                                    │
│  Lane 2 (Authority 80)  ──► SwarmMind (THIS REPO)                 │
│    github.com/vortsghost2025/SwarmMind-Self-Optimizing-Multi-Agent-AI-System
│  Role: Execution & Self-Optimization (Center Lane)                 │
│  - Multi-agent swarm execution (Planner → Coder → Reviewer → Exec) │
│  - Cognitive trace viewer (transparent AI reasoning)              │
│  - Auto-scaling & experimentation engine                          │
│  - Governed by Lane 1, constrained by FILE_OWNERSHIP_REGISTRY     │
│                                                                    │
│  Lane 3 (Authority 60)  ──► [self-organizing-library]             │
│    github.com/vortsghost2025/self-organizing-library              │
│  Role: Knowledge Graph & Persistent Memory (Lane R)               │
│  - NexusGraph: massive document ingestion & cross-referencing     │
│  - Bi-directional linking (Rosetta Stone citations: [[doc-id]])   │
│  - External source connectors (GitHub, Medium, DOI, Twitter)     │
│  - Vector search & graph visualization                             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘

Cross-lane writes require authority ≥ 100 OR target owned by same lane.
Enforced by LaneContextGate (SPEC_AMENDMENT_LANE_CONTEXT_GATE).
```

---

## Purpose & Scope

**SwarmMind exists to execute.** It is the controlled center of the three-lane organism — the only lane that can take action in the world, but only under constitutional constraints.

- **Scope:** Task execution via agent swarm, cognitive trace capture, auto-scaling, experimentation
- **Not in scope:** Governance definitions, cross-lane write permissions, final verification — those belong to Lanes 1 and 3
- **Boundary:** Cannot write to paths owned by Lane 1 or Lane 3 (enforced by `LaneContextGate`)
- **Output:** Results, traces, logs — to SwarmMind-owned directories only; other lanes ingest independently

---

## Essential Reading (3 Files Maximum)

If you want to understand SwarmMind in the shortest possible time, read these three files in order:

1. **`S:\Archivist-Agent\BOOTSTRAP.md`** — The single entry point that defines the entire three-lane organism. Everything flows from this.
2. **`S:\Archivist-Agent\FILE_OWNERSHIP_REGISTRY.json`** — The lane boundary map. Shows exactly which paths SwarmMind can write to and which are off-limits.
3. **`scripts/governed-start.js`** — The actual startup sequence that loads governance, initializes the gate, and launches the app. Implementation of steps 1–5 in the "Start Here" workflow.

Once you've read these three, you understand:
- **Why** SwarmMind exists (BOOTSTRAP.md)
- **Where** it can operate (FILE_OWNERSHIP_REGISTRY.json)
- **How** it enforces boundaries (governed-start.js → LaneContextGate)

For deeper dives, see the "Further Reading" section below.

---

## What SwarmMind Does

**Mission:** Execute tasks using specialized AI agents while providing full cognitive transparency and self-optimization through comparative experimentation.

### What SwarmMind Is

- ✅ **An execution lane** — The only lane in the three-lane system that performs work
- ✅ **Governance-bound** — Operates under Archivist-Agent's constitutional constraints
- ✅ **Cross-lane write enforced** — Blocked from writing to Lane 1 and Lane 3 territory (LaneContextGate)
- ✅ **Self-optimizing** — Continuously experiments to find better execution strategies
- ✅ **Fully traceable** — Every decision, action, and result captured in cognitive traces

### What SwarmMind Is NOT

- ❌ A standalone system — requires Archivist-Agent's governance files
- ❌ A rogue agent — cannot decide its own constraints or override lane boundaries
- ❌ A member of the organism it executes for — it evaluates work, it is not the work
- ❌ A project that owns its session state — controlled by Archivist's SESSION_REGISTRY.json
- ❌ A system that writes everywhere — same-lane only; cross-lane blocked by design

---

### Core Capabilities

1. **Agent Swarm Execution** — Decompose tasks across 4 specialist agents:
   - **Planner** — Breaks down requirements into actionable steps
   - **Coder** — Implements the solution (code generation)
   - **Reviewer** — Evaluates quality, identifies issues
   - **Executor** — Runs the solution and collects results

2. **Cognitive Trace Viewer** — Every agent's reasoning is logged and displayed as a visual tree:
   - Who did what and when
   - Decision rationale with timestamps
   - End-to-end task flow visualization
   - Exportable trace data for audit

3. **Experimentation Engine** — Compare strategies autonomously:
   - Single generalist agent (does all roles)
   - Multi-agent swarm (specialized collaboration)
   - Metrics: time, efficiency, steps completed
   - Data-driven recommendation on which approach wins

4. **Auto-Scaling** — Dynamically adjust agent pool based on queue depth:
   - Minimum/maximum bounds per role
   - Scale up when backlog grows
   - Scale down when idle

---

## Governance Integration (Phase 2 Complete)

SwarmMind operates under **Archivist-Agent's constitutional governance**:

```
Startup Sequence:
1. Load FILE_OWNERSHIP_REGISTRY.json from S:\Archivist-Agent
2. Read .session-lock → determine lane identity (swarmmind, auth=80)
3. Verify pwd matches session-lock (lane-context reconciliation)
4. Install global fs monkey-patch (LaneContextGate.patchFs())
5. All subsequent file writes pass through preWriteGate()
   ├─ Same-lane write (to SwarmMind directory) → ✅ ALLOWED
   ├─ Cross-lane to Archivist (auth=100) → ❌ BLOCKED → HOLD
   └─ Cross-lane to Library (auth=60) → ❌ BLOCKED → HOLD
6. If HOLD entered → operator must call exitHold() to resume
```

**Enforcement points:**
- Session start: pwd + session-lock + ownership registry must align
- Pre-write hook: Every `fs.writeFileSync`, `fs.appendFileSync`, `fs.mkdirSync`, `fs.unlinkSync` checked
- Directory change: Lane boundary detection on path resolution
- Registry updates: Authority verified before modifying cross-lane files

---

## Relationship to Other Lanes

### Dependency on Archivist-Agent (Lane 1)
- **Bootstrap:** Archivist's `BOOTSTRAP.md` is the single entry point for all governance
- **Ownership:** `FILE_OWNERSHIP_REGISTRY.json` defines what paths belong to which lane
- **Verification:** Archivist performs Lane L (structural) verification of SwarmMind's compliance
- **Authority:** Archivist (100) can write anywhere; SwarmMind (80) cannot write to Archivist-owned paths

### Coordination with self-organizing-library (Lane 3)
- **Default ownership:** unspecified paths default to Archivist (100), not Library (60)
- **Write policy:** SwarmMind cannot write directly to Library unless authority ≥ 100
- **Data flow:** SwarmMind outputs results to console/trace; Library ingests independently
- **No direct coupling:** Lanes communicate via shared governance (Archivist) not direct file writes

---

## Session State & Cross-Lane Coordination

**Session tracking:**
- `.session-lock` — Contains `lane_id`, `session_id`, `acquired`, `expires`
- `RUNTIME_STATE.json` — Runtime state synced with session ID (must match `.session-lock`)
- `SESSION_REGISTRY.json` (in Archivist-Agent) — Central registry of all active lanes

**Cross-lane sync protocol:**
1. Each lane acquires its own `.session-lock`
2. Archivist maintains master `SESSION_REGISTRY.json` with all active sessions
3. Lanes report heartbeat/status to registry (coordination via governance root)
4. Phase 2 gate prevents one lane from impersonating or writing to another's territory

---

## Foundational Research (Rosetta Stone Papers Theory → Concrete Files)

The three-lane architecture is derived from the **WE4FREE Resilience Framework** (OSF: https://osf.io/n3tya). Here, theory maps directly to implementation:

| Paper (Theory) | Title | Concrete Implementation in SwarmMind |
|----------------|-------|--------------------------------------|
| Paper 1 | Error Handling & Resilience | `src/core/laneContextGate.js` — constraint-aware cross-lane block + HOLD |
| Paper 2 | Constitution-Preserving Resilience | `scripts/governed-start.js` — governance resolution before any execution |
| Paper 3 | Sharp Edges Clarifications | `REFERENCE_ARCHIVIST.md` — incident histories as edge-case solutions |
| Paper 4 | Architecture Review Checklist | `scripts/verify-phase2.js` — automated Phase 2 compliance checks |
| Paper 5 | Decision Matrix | `src/agents/reviewer.js` — confidence ratings, checkpoint verification |

The papers are stored in `S:\Archivist-Agent\` as `paper1.txt` through `paper5.txt`. Every line of SwarmMind code is derived from one of these five foundational documents.

---

## How to Use This Repo

### Installation
```bash
cd "S:\SwarmMind Self-Optimizing Multi-Agent AI System"
npm install
```

### Run Governed (Recommended)
```bash
npm start
# or
node scripts/governed-start.js
```
This loads governance context from Archivist-Agent and enforces cross-lane boundaries.

### Run Isolated (Demo Only)
```bash
npm run start:isolated
# or
node src/app.js
```
No governance; same-lane operations only; no cross-lane checks.

### Run Verification
```bash
node scripts/verify-phase2.js
```
Validates Phase 2 gate integration (all checks should be ✅).

### Run Cross-Lane Block Test
```bash
node scripts/test-lane-gate.js
```
Tests: same-lane allow, cross-lane block, HOLD exit.

---

## Current Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Multi-agent orchestration | ✅ Complete | Planner, Coder, Reviewer, Executor |
| Cognitive trace viewer | ✅ Complete | Text + structured trace capture |
| Auto-scaling manager | ✅ Complete | Threshold-based pool management |
| Experimentation engine | ✅ Complete | Single vs multi-agent comparison |
| Governance resolver (v2) | ✅ Complete | Three-mode architecture, inherits from Archivist |
| Lane-context gate (Phase 2) | ✅ Complete | Global fs patch, HOLD state, operator resolution |
| File ownership registry | ✅ Loaded | From `S:\Archivist-Agent\FILE_OWNERSHIP_REGISTRY.json` |
| Cross-lane write enforcement | ✅ Active | Blocked for Archivist (100) and Library (60) |
| Session state sync | ✅ Complete | `.session-lock` ↔ `RUNTIME_STATE.json` ↔ `SESSION_REGISTRY.json` |

---

## Project Structure

```
S:\SwarmMind Self-Optimizing Multi-Agent AI System/
├── src/
│   ├── agents/                  # Specialist agent implementations
│   │   ├── planner.js           # Task decomposition
│   │   ├── coder.js             # Code generation
│   │   ├── reviewer.js          # Quality evaluation
│   │   ├── executor.js          # Solution execution
│   │   └── generalist/          # All-in-one agent for single-agent mode
│   ├── core/
│   │   ├── agent.js             # Base Agent class (now laneGate-aware)
│   │   ├── scalingManager.js    # Dynamic agent pool management
│   │   ├── experimentationEngine.js # A/B test framework
│   │   └── laneContextGate.js   # Phase 2: cross-lane write enforcement
│   ├── ui/
│   │   └── traceViewer.js       # Cognitive trace visualization
│   └── app.js                   # Main entry (isolated mode)
├── scripts/
│   ├── governed-start.js        # Phase 2: gate init → resolver → app
│   ├── resolve-governance-v2.js # Governance loading + guarded writes
│   ├── test-lane-gate.js        # Unit tests for gate
│   ├── verify-phase2.js         # Integration verification
│   └── verify.js                # System health checks
├── verification/                # CI/CD verification artifacts
├── logs/                        # Runtime logs
├── GOVERNANCE_MANIFEST.json     # Declares governance inheritance (archivist-agent)
├── GOVERNANCE_RESOLUTION.json   # Resolved governance context (output)
├── RUNTIME_STATE.json           # Current lane state (session, mode, claims)
├── .session-lock                # Active session lock (lane_id, session_id, expires)
├── package.json                 # Dependencies (node-fetch)
├── kilo.json                    # Kilo orchestrator agent config
└── README.md                    # This file
```

---

## Git Workflow & Cross-Lane Coordination

**Commit convention** (from MULTI_PROJECT_GIT_SYNTHESIS.md):
```
[LANE-2] [SYNC-YYYY-MM-DD] Brief description

Cross-lane: Yes/No
Depends-on: archivist/[SHA] (if applicable)
Required-by: library/[SHA] (if applicable

Detailed description...
```

**Coordination:** Each lane commits independently. Cross-lane changes reference each other via commit messages. No meta-repo yet; Archivist may create coordination layer later.

---

## Verification & Testing

### Phase 2 Gate Verification
```bash
node scripts/verify-phase2.js
```
Checks:
- ✅ FILE_OWNERSHIP_REGISTRY.json loads
- ✅ Gate initialization completes
- ✅ Session-lane reconciliation works
- ✅ preWriteGate blocks cross-lane
- ✅ HOLD state triggers on block
- ✅ exitHold clears HOLD

### Cross-Lane Block Test (From Archivist)
```bash
# Attempt to write to Archivist-owned territory (should FAIL)
node -e "const fs=require('fs');fs.writeFileSync('S:\\Archivist-Agent\\test.txt','test');"
```
Expected: `Error: Cross-lane write blocked` — gate throws, file NOT created.

### System Verification
```bash
node verify.js
```
Runs full system health check: agents alive, traces captured, no failed tasks, latency OK.

---

## Known Limitations

- **Process isolation:** Global fs patch only affects current Node process. Separate `node -e` commands spawn fresh processes without gate installed. This is a Node limitation; OS-level sandboxing needed for true process isolation (Phase 3 candidate).
- **No cross-lane writes:** SwarmMind cannot directly write to Archivist or Library files (by design). Use governance-approved channels (session registry, lane relays) for communication.
- **No demo mode:** `npm start` always attempts governance resolution; if Archivist is down, falls back to isolated mode (check logs).

---

## Troubleshooting

**Gate not initializing?**
- Check `S:\Archivist-Agent\FILE_OWNERSHIP_REGISTRY.json` exists
- Verify `.session-lock` present and not expired
- Ensure `process.cwd()` is SwarmMind directory

**HOLD state stuck?**
```bash
node -e "const {LaneContextGate}=require('./src/core/laneContextGate');const g=new LaneContextGate(process.cwd(),{governanceRoot:'S:\\Archivist-Agent'});g.initialize();if(g.isOnHold()){g.exitHold('operator');console.log('Cleared');}"
```

**Cross-lane write still working?**
- You're probably running a separate Node process that hasn't loaded `laneContextGate.js`
- Gate only patches `fs` in processes that call `laneGate.patchFs()` (done in `governed-start.js`)
- Test within same process using `test-lane-gate.js`

---

## Further Reading

**SwarmMind Internals:**
- `REFERENCE_ARCHIVIST.md` — Concise guide to Lane 1 governance root (role, files, policies)
- `REFERENCE_LIBRARY.md` — Concise guide to Lane 3 verification & memory layer
- `laneContextGate.js` — Phase 2 implementation (cross-lane fs monkey-patch)
- `governed-start.js` — Governance bootstrap sequence
- `governance/` — Resolved constitutional context from Archivist

**Archivist-Agent Governance (Lane 1):**
- `S:\Archivist-Agent\BOOTSTRAP.md` — Single entry point, organism definition
- `S:\Archivist-Agent\GOVERNANCE.md` — 7 Laws, 3 Invariants, Checkpoints
- `S:\Archivist-Agent\FILE_OWNERSHIP_REGISTRY.json` — Lane boundaries & write policy
- `S:\Archivist-Agent\SESSION_REGISTRY.json` — Active sessions across all lanes
- `S:\Archivist-Agent\VERIFICATION_LANES.md` — L + R dual verification protocol
- `S:\Archivist-Agent\MULTI_PROJECT_GIT_SYNTHESIS.md` — Cross-lane commit conventions

**Self-Organizing Library (Lane 3):**
- `FORMAL_VERIFICATION_GATE_PHASE2.md` — Phase 2 compliance assessment report
- `SPEC.md` — NexusGraph feature specification
- `IMPLEMENTATION_COMPASS.md` — WE4FREE paper distillation → operational rules
- `PATTERN_DECISION_TREE.md` — 8 decision flowcharts for failure modes
- `QUICK_LOOKUP_INDEX.md` — Pattern→file→paper cross-reference index
- `ARCHIVIST_QUICK_REFERENCE.md` — 1-page Archivist operations guide

**Incident Analysis (Post-Mortems):**
- `ARCHIVIST_HALLUCINATION_ANALYSIS.md` — Cross-lane write gap pre-Phase 2
- `SESSION_ID_FRAGMENTATION_FIX.md` — Session-state sync protocol
- `SELF_STATE_ALIASING_FAILURE_MODE.md` (in Library) — Self-state precedence rule

---

## Phase 3: Transactional Queue Subsystem (In Progress)

Phase 3 introduces a **de‑coupled coordination layer** — a set of append‑only JSON‑line queues that allow lanes to exchange typed artifacts without direct coupling. Each queue item is a **claim** awaiting execution, verification, approval, or rejection. The queue preserves auditability, timing independence, and failure isolation.

### Queue Types

| Queue | Purpose | Item Types |
|-------|---------|------------|
| **COMMAND** | Bounded "do this now" actions (rare) | `command_request` |
| **REVIEW** | Verification & policy review requests | `verification_request`, `policy_review` |
| **APPROVAL** | Await governance decisions | `policy_update`, `approval_request` |
| **INCIDENT** | Runtime failures, HOLD states, NFM findings | `incident_report`, `hold_notice` |
| **IDEA_DEFERRED** | Good ideas saved for later | `idea_proposal` |

### Queue Item Schema (Minimum Fields)

```json
{
  "id": "Q-2026-04-18-001",
  "timestamp": "2026-04-18T16:15:00Z",
  "origin_lane": "swarmmind",
  "target_lane": "archivist",
  "type": "approval_request",
  "artifact_path": "S:/SwarmMind/.../PHASE3_POLICY.md",
  "required_action": "approve",
  "proof_required": ["git log -1", "test output"],
  "status": "pending",
  "resolution": null,
  "payload": { ... }
}
```

State transitions: `pending → accepted / rejected / superseded`. Only `pending` items may transition.

### Components Implemented

- **`src/queue/Queue.js`** – File‑based append‑only queue with enqueue, getPending, updateStatus.
- **`src/permissions/FilePermissionEnforcer.js`** – Lane‑based whitelist enforcement on all `fs` and `fs.promises` methods; integrates with `laneContextGate` (throws `E_PERMISSION_DENIED` on violations).
- **`src/audit/AuditLogger.js`** – Immutable audit log capturing every enqueue and status change; can generate summaries and export human‑readable reports.
- **`src/attestation/IdentityAttestation.js`** – Lane identity and signature stub (HMAC‑SHA256); `signQueueItem` and `verifyQueueItem` helpers for future non‑repudiation.
- **`src/security/SeccompSimulator.js`** – Placeholder documenting the seccomp‑bpf interface; logs syscall checks against a whitelist.

### Test Harnesses

```bash
node scripts/test-queue.js          # Queue CRUD & state transition
node scripts/test-permissions.js    # Whitelist enforcement, violation blocking
node scripts/test-audit.js          # Audit log capture, reporting
node scripts/test-attestation.js    # Identity signing & verification
node scripts/test-seccomp.js        # Syscall whitelist simulation
```

All tests should pass before committing Phase 3 artifacts.

### Integration Points

- **`governed-start.js`** – On startup, read the **APPROVAL** queue and apply any pending policy updates automatically.
- **`laneContextGate.js`** – On HOLD or violation, emit an **INCIDENT** queue entry for audit.
- **Library test runner** – Emit a **REVIEW** queue item for each verification request.

### Governance

Phase 3 work is authorized by `DECISION_PHASE3_QUEUE_SUBSYSTEM`. All changes must follow the Git Protocol (scan‑for‑secrets, push immediately). The next step after implementation is Library verification of the new test suite.

---

**SwarmMind operates as a constrained execution lane within a governed multi-agent organism.**

**Structure > Identity. Correction > Agreement.**  
**The gate enforces boundaries so collaboration can scale without drift.**

---

*Built with Kilo orchestrator · Governed by Archivist-Agent · Part of the WE4FREE Resilience Framework*
