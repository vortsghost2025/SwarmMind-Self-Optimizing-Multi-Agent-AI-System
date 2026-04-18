# SwarmMind: Trace-Mediated Verification Surface (Lane 2)

**Operational Status:** ✅ Active — Isolated Interior Lattice-Constrained Verification Lane  
**Authority:** 80 (Execution Layer)  
**Governance Root:** `S:\Archivist-Agent` (Authority 100)  
**Session ID:** Dynamic per run (tracked in `.session-lock`)  
**Cross-Lane Policy:** `require_authority_100_or_same_lane` — enforced via `LaneContextGate`

---

## Big Picture: The Three-Lane Architecture

SwarmMind is **Lane 2** of a three-lane verification organism:

```
┌────────────────────────────────────────────────────────────────────┐
│                     THREE-LANE VERIFICATION ORGANISM                │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Lane 1 (Authority 100)  ──►  Archivist-Agent                      │
│  Role: Governance Root & Structural Verification (Lane L)          │
│  - Maintains constitutional constraints (S:.global)               │
│  - Single entry point: BOOTSTRAP.md                               │
│  - Dual verification coordination (L + R lanes)                   │
│  - FILE_OWNERSHIP_REGISTRY.json defines lane boundaries           │
│                                                                    │
│  Lane 2 (Authority 80)   ──►  SwarmMind (THIS REPO)               │
│  Role: Execution & Self-Optimization (Center Lane)                 │
│  - Multi-agent swarm execution (Planner → Coder → Reviewer → Exec) │
│  - Cognitive trace viewer (transparent AI reasoning)              │
│  - Auto-scaling & experimentation engine                          │
│  - Governed by Lane 1, constrained by FILE_OWNERSHIP_REGISTRY     │
│                                                                    │
│  Lane 3 (Authority 60)   ──►  self-organizing-library             │
│  Role: Knowledge Graph & Persistent Memory (Lane R)               │
│  - NexusGraph: massive document ingestion & cross-referencing     │
│  - Bi-directional linking (Rosetta Stone citations: [[doc-id]])   │
│  - External source connectors (GitHub, Medium, DOI, Twitter)     │
│  - Vector search & graph visualization                             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘

Cross-lane writes require authority ≥ 100 OR target owned by same lane.
Enforced by LaneContextGate (Phase 2 implementation, SPEC_AMENDMENT_LANE_CONTEXT_GATE).
```

---

## What SwarmMind Does

**Mission:** Execute tasks using specialized AI agents while providing full cognitive transparency and self-optimization through comparative experimentation.

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

## Foundational Research (Rosetta Stone Papers)

The three-lane architecture and constitutional governance are derived from the **WE4FREE Resilience Framework** (OSF: https://osf.io/n3tya):

1. **Error Handling & Resilience** — Constraint-aware error handling
2. **Constitution-Preserving Resilience** — Failing without violating core values
3. **Sharp Edges Clarifications** — Edge case solutions
4. **Architecture Review Checklist** — Compliance assessment
5. **Decision Matrix** — Error domain → strategy → budget mapping

These papers are stored in `S:\Archivist-Agent\` as `paper1.txt` through `paper5.txt` and form the theoretical foundation for:
- Why three separate lanes (not monolithic)
- Why dual verification (L + R)
- Why structure > identity
- Why correction mandatory, agreement optional

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

- `ARCHIVIST_HALLUCINATION_ANALYSIS.md` — Incident analysis of cross-lane write gaps
- `SESSION_ID_FRAGMENTATION_FIX.md` — Session state sync protocol
- `MULTI_PROJECT_GIT_SYNTHESIS.md` — Cross-lane coordination strategy
- `VERIFICATION_SUMMARY.md` — System verification results
- `docs/` in Archivist-Agent — Governance deep dive (BOOTSTRAP.md, GOVERNANCE.md, VERIFICATION_LANES.md)

---

**SwarmMind operates as a constrained execution lane within a governed multi-agent organism.**

**Structure > Identity. Correction > Agreement.**  
**The gate enforces boundaries so collaboration can scale without drift.**

---

*Built with Kilo orchestrator · Governed by Archivist-Agent · Part of the WE4FREE Resilience Framework*
