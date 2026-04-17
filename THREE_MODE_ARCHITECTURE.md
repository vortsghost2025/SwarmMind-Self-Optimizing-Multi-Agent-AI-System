# THREE MODE ARCHITECTURE - EXPLANATION

**Created:** 2026-04-16
**Status:** Implementation Complete
**Purpose:** Explain the three runtime modes for SwarmMind governance integration

---

## The Gap Identified

**From External Lane Analysis (GPT):**

SwarmMind's initial fix created a single-mode architecture:
- `governed-standalone` → inherits from Archivist
- `fallback: isolated-demo` → runs without governance

But this missed a critical third mode identified by external lane analysis.

---

## Three Modes Required

| Mode | Description | Governance Active | External Lane | Claim Limit |
|------|-------------|-------------------|---------------|-------------|
| **A: governed-standalone** | Archivist-governed child | `true` | `true` | `full` |
| **B: standalone-lattice** | Runs alone + exports to external verifier | `false` | `true` | `annotation-only` |
| **C: isolated-demo** | Local only, no governance, no external lanes | `false` | `false` | `none` |

---

## Mode A: governed-standalone

**What it is:**
- SwarmMind as a fully governed child of Archivist-Agent
- All governance constraints enforced
- External verification lanes active

**Use case:**
- Production governance integration
- Full constitutional enforcement
- Multi-agent coordination under governance

**Startup sequence:**
```
1. Check manifest
2. Resolve parent governance
3. Verify bootstrap exists
4. Load governance context
5. Register extension hooks
6. Setup external lane
7. Continue startup
```

**Behavior:**
- All agent actions route through `S:\Archivist-Agent\BOOTSTRAP.md`
- Governance constraints enforced in real-time
- External lanes (L, R, External) active
- Full claim validation

---

## Mode B: standalone-lattice

**What it is:**
- SwarmMind runs independently
- No governance enforcement
- Exports traces to external verifier for review
- Claims annotated, not blocked

**Use case:**
- Constraint-lattice-only operation
- External verification overlay
- Independent execution with post-hoc review

**Startup sequence:**
```
1. Check manifest
2. Determine mode (standalone-lattice)
3. Skip parent governance resolution
4. Skip bootstrap verification
5. Setup external lane (annotation-only)
6. Expose extension hooks (for export)
7. Continue startup
```

**Behavior:**
- Agent runs without governance enforcement
- Claims are annotated with governance fields
- Traces exported for external lane review
- No blocking, only observation

**Critical distinction:**
- Mode A: Governance enforces BEFORE action
- Mode B: External verifier reviews AFTER action
- Mode C: No enforcement or review

---

## Mode C: isolated-demo

**What it is:**
- SwarmMind in complete isolation
- No governance context
- No external lanes
- Pure local execution

**Use case:**
- Hackathon demonstration
- Standalone demo without governance
- Testing without governance overhead

**Startup sequence:**
```
1. Check manifest (not found)
2. Fallback to isolated-demo
3. Skip all governance
4. Skip external lanes
5. Continue startup
```

**Behavior:**
- Agent runs standalone
- No governance fields added
- No external verification
- Pure demo mode

---

## Why Three Modes Matter

### The Problem with Two Modes

**Before fix:**
- `governed-standalone` (enforced)
- `isolated-demo` (fallback)

**Gap:**
- No way to run independently BUT still export to external verifier
- No way to have "constraint-lattice-only" operation
- Mode B (standalone-lattice) was conflated with Mode C (isolated-demo)

### The Solution with Three Modes

**After fix:**
- Mode A: Full governance (enforced)
- Mode B: Independent + external review (observed)
- Mode C: Complete isolation (none)

This matches the external lane analysis requirement for "runs alone + exports to external verifier."

---

## Implementation Details

### GOVERNANCE_MANIFEST.json

```json
{
  "runtime": {
    "mode": "governed-standalone",
    "modes": {
      "governed-standalone": {
        "description": "Archivist-governed child project",
        "governance_active": true,
        "external_lane_enabled": true,
        "claim_limit": "full"
      },
      "standalone-lattice": {
        "description": "Runs alone + exports to external verifier",
        "governance_active": false,
        "external_lane_enabled": true,
        "claim_limit": "annotation-only"
      },
      "isolated-demo": {
        "description": "Local only, no governance, no external lanes",
        "governance_active": false,
        "external_lane_enabled": false,
        "claim_limit": "none"
      }
    }
  }
}
```

### scripts/resolve-governance-v2.js

Key methods:
- `determineMode()` — Selects mode from CLI/env/manifest
- `resolveParentGovernance()` — Only runs if `governance_active=true`
- `loadGovernanceContext()` — Only runs if `governance_active=true`
- `setupExternalLane()` — Only runs if `external_lane_enabled=true`

### scripts/governed-start-v2.js

Injects mode configuration into SwarmMind execution:
- Governance context (if active)
- External lane config (if enabled)
- Claim limit settings

---

## Mode Selection Priority

1. **CLI Flag:** `--mode=<mode>`
2. **Environment Variable:** `SWARMIND_MODE=<mode>`
3. **Manifest Default:** `GOVERNANCE_MANIFEST.json` → `runtime.mode`

Example:
```bash
# Via CLI
npm run start:mode -- --mode=standalone-lattice

# Via environment
SWARMIND_MODE=isolated-demo npm start

# Via manifest (default)
npm start  # Uses GOVERNANCE_MANIFEST.json runtime.mode
```

---

## Claim Limits Explained

| Mode | Claim Limit | Meaning |
|------|-------------|---------|
| governed-standalone | `full` | Claims fully validated before action |
| standalone-lattice | `annotation-only` | Claims annotated, validated externally |
| isolated-demo | `none` | No claim processing |

---

## External Lane Integration

### Mode A (governed-standalone)
- External lanes active: L (implementation), R (review), External (human)
- Claims validated in real-time
- Blocking on governance failure

### Mode B (standalone-lattice)
- External lanes export only
- Claims annotated with governance fields
- No blocking, only observation

### Mode C (isolated-demo)
- No external lane integration
- No governance fields
- Pure local execution

---

## Testing the Modes

### Test Mode A
```bash
npm run resolve
# Should show: governance_active=true, external_lane=true, claim_limit=full
```

### Test Mode B
```bash
npm run resolve -- --mode=standalone-lattice
# Should show: governance_active=false, external_lane=true, claim_limit=annotation-only
```

### Test Mode C
```bash
SWARMIND_MODE=isolated-demo npm run resolve
# Should show: governance_active=false, external_lane=false, claim_limit=none
```

---

## Summary

The three-mode architecture addresses the gap identified by external lane analysis:

1. **Mode A (governed-standalone):** Full governance integration
2. **Mode B (standalone-lattice):** Independent + external review
3. **Mode C (isolated-demo):** Complete isolation

Each mode has distinct:
- Governance activation
- External lane behavior
- Claim handling
- Use cases

This makes SwarmMind's governance integration **executable** across multiple runtime scenarios, not just documented.

---

**References:**
- `GOVERNANCE_MANIFEST.json` — Mode definitions
- `scripts/resolve-governance-v2.js` — Mode resolver
- `scripts/governed-start-v2.js` — Mode-aware startup
- `CONTEXT_BOUNDARY_FAILURE_2026-04-16.md` — Original failure analysis
