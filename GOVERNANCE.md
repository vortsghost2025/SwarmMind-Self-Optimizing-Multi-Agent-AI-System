# GOVERNANCE-AWARE OPERATION

**SwarmMind** is an integration target of **Archivist-Agent** and operates within the constitutional governance framework.

---

## Quick Start

```bash
# Resolve governance context (shows active mode)
npm run resolve

# Start with default mode (governed-standalone)
npm start

# Start in specific mode
npm run start:mode -- --mode=standalone-lattice
SWARMIND_MODE=isolated-demo npm start

# Start completely isolated (fallback)
npm run start:isolated
```

---

## Three Runtime Modes

SwarmMind supports **three runtime modes** identified by external lane analysis:

### Mode A: governed-standalone

**Description:** Archivist-governed child project

- **Governance Active:** `true`
- **External Lane:** `true`
- **Claim Limit:** `full`
- **Use Case:** Full governance integration with enforcement

**Startup Sequence:**
```
check_manifest
  ↓
resolve_parent_governance
  ↓
verify_bootstrap_exists
  ↓
load_governance_context
  ↓
register_extension_hooks
  ↓
setup_external_lane
  ↓
continue_startup
```

### Mode B: standalone-lattice

**Description:** Runs alone + exports to external verifier (constraint-lattice-only)

- **Governance Active:** `false`
- **External Lane:** `true`
- **Claim Limit:** `annotation-only`
- **Use Case:** Independent execution with external verification overlay

**Behavior:**
- SwarmMind runs without governance enforcement
- Claims are annotated, not enforced
- External verifier responsible for validation
- Trace exports to external lane for review

### Mode C: isolated-demo

**Description:** Local SwarmMind only, no governance, no external lanes

- **Governance Active:** `false`
- **External Lane:** `false`
- **Claim Limit:** `none`
- **Use Case:** Standalone demonstration (hackathon mode)

**Behavior:**
- Complete isolation
- No governance context
- No external verification
- Pure demo execution

---

## Mode Selection

Modes can be selected via:

1. **CLI Flag:** `--mode=<mode>`
2. **Environment Variable:** `SWARMIND_MODE=<mode>`
3. **Manifest Default:** `GOVERNANCE_MANIFEST.json` → `runtime.mode`

Priority order: CLI > Environment > Manifest

---

## Governance Architecture

### Relationship

- **Parent Project:** `S:\Archivist-Agent`
- **Relationship Type:** `integration-target`
- **Derivation Chain:** `papers → Archivist-Agent → SwarmMind`
- **Role:** `trace-mediated verification surface`

### Entry Point

All logic routes through:

```
S:\Archivist-Agent\BOOTSTRAP.md
```

This is the **single entry point** for governance. SwarmMind inherits this structure (when `governance_active=true`).

---

## What This Means

### SwarmMind IS

- **Trace layer** — records reasoning path with timestamps
- **Audit surface** — makes decisions inspectable after the fact
- **Discrepancy exposer** — shows where branches diverge
- **Cognition visualizer** — displays step-by-step agent thinking
- **Comparison engine** — single vs multi-agent strategy results

### SwarmMind IS NOT

- **Truth oracle** — does not declare correctness
- **Enforcement mechanism** — does not block drift
- **Replacement for external lanes** — does not collapse verification
- **Interpreter of certainty** — does not narrate confidence
- **Governance substitute** — does not replace BOOTSTRAP/lattice

---

## Governance Extension

SwarmMind integrates with the governance extension located at:

```
S:\Archivist-Agent\swarmmind-governance-extension\
```

### Fields Added to Traces

| Field | Values | Purpose |
|-------|--------|---------|
| `source` | `agent` \| `human` | Who made this entry |
| `claim` | string | What was claimed |
| `evidence` | string[] | Evidence references |
| `governance_check` | `passed` \| `failed` \| `skipped` \| `unknown` | Governance consultation status |
| `drift_signal` | `none` \| `warning` \| `measured` \| `critical` | Drift status |
| `branch` | `main` \| `alternative` \| `corrected` \| `abandoned` | Decision branch |

### Current Mode

**Mode 1: Manual Capture**

- SwarmMind runs independently
- Agent traces exported manually
- Human traces captured via CLI
- Merge happens offline

**Mode 2 & 3: Future Integration**

- Mode 2 (Embedded) and Mode 3 (Post-Session) have NOT earned the right to exist yet
- Must prove Mode 1 useful in real sessions first

---

## Verification Lanes

SwarmMind operates across three verification lanes:

- **L Lane (Left):** Implementation — building, coding, executing
- **R Lane (Right):** Review — checking, validating, correcting
- **External Lane:** Human validation — waiting for human verification

---

## Governance Constraints

SwarmMind operates under these constraints:

1. **Single entry point** — All logic routes through BOOTSTRAP.md
2. **Structure > Identity** — External governance overrides agent preferences
3. **Correction is mandatory** — Agreement is optional
4. **Agent evaluates WE** — Agent is NOT part of WE
5. **No truth claims** — SwarmMind never declares correctness
6. **Trace layer, not oracle** — Records, doesn't interpret

---

## Files

| File | Purpose |
|------|---------|
| `GOVERNANCE_MANIFEST.json` | Machine-readable project relationship |
| `scripts/resolve-governance.js` | Runtime discovery resolver |
| `scripts/governed-start.js` | Governance-aware startup wrapper |
| `kilo.json` | Kilo configuration with governance awareness |
| `CONTEXT_BOUNDARY_FAILURE_2026-04-16.md` | Failure analysis and fix documentation |
| `GOVERNANCE_RESOLUTION.json` | (Generated) Runtime resolution result |

---

## Startup Sequence

```
project start
  ↓
check for GOVERNANCE_MANIFEST.json
  ↓
resolve parent governance root
  ↓
verify BOOTSTRAP.md exists
  ↓
load governance context
  ↓
register project relationship
  ↓
expose extension hooks
  ↓
continue SwarmMind startup
```

---

## Integration with Archivist-Agent

### What SwarmMind Gets from Parent

- Governance entry point (BOOTSTRAP.md)
- Constitutional constraints
- Verification lanes
- Drift detection (CPS, UDS)
- Governance extension (trace fields)
- Project registry

### What SwarmMind Provides to Parent

- Trace-mediated verification surface
- Multi-agent execution results
- Cognitive trace visualization
- Strategy comparison data

---

## Evidence

- **Integration Spec:** `S:\Archivist-Agent\.artifacts\SWARMIND_INTEGRATION_SPEC.md`
- **Extension Status:** `S:\Archivist-Agent\.artifacts\SWARMIND_GOVERNANCE_EXTENSION_STATUS.md`
- **Project Registry:** `S:\Archivist-Agent\registry\PROJECT_REGISTRY.md`
- **Derivation Map:** `S:\Archivist-Agent\registry\DERIVATION_MAP.md`

---

## Failure History

**Context-Boundary Failure (2026-04-16):**

Governance was documented as inherited, but not declared as discoverable. This violated the single entry point rule and broke the derivation chain at runtime.

**Fix:** Added `GOVERNANCE_MANIFEST.json`, resolver script, and governance-aware startup to make project relationships executable, not just documented.

See: `CONTEXT_BOUNDARY_FAILURE_2026-04-16.md`

---

## Next Steps

1. ✅ Governance manifest created
2. ✅ Resolver script implemented
3. ✅ Startup wrapper created
4. ✅ Kilo configuration updated
5. ⏳ Test execution pending
6. ⏳ Integration with live governance pending

---

**Version:** 1.0.0
**Governance Status:** Integrated (Mode 1 manual)
**Parent Project:** S:\Archivist-Agent
**Last Updated:** 2026-04-16
