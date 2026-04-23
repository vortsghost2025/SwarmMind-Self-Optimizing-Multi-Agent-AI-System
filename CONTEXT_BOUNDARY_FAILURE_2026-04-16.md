# CONTEXT_BOUNDARY_FAILURE_2026-04-16.md

**Date:** 2026-04-16
**Severity:** CRITICAL
**Type:** Architecture Failure
**Category:** Context-Boundary Failure

---

## FAILURE SUMMARY

**Governance is documented as inherited, but not declared as discoverable.**

The SwarmMind project relationship to Archivist-Agent exists in documentation, but **not in executable discovery**. This violates the governance model's single entry point rule and breaks the derivation chain at runtime.

---

## SYMPTOMS

### What Happened

1. User launched Kilo agent in SwarmMind directory
2. Agent operated in complete isolation from parent governance
3. No path to discover Archivist-Agent hierarchy
4. No awareness of multi-project registry
5. Governance extension invisible at runtime

### Evidence

- Working directory: `S:\SwarmMind Self-Optimizing Multi-Agent AI System`
- No `kilo.json` in SwarmMind project
- No `GOVERNANCE_MANIFEST.json` declaring relationship
- No resolver script to bridge contexts
- Agent blind to `S:\Archivist-Agent` despite being "integration target"

---

## ROOT CAUSE

### Two Entry Points Problem

**Documented Entry Point:**
```
S:\Archivist-Agent\BOOTSTRAP.md
↓
"All logic routes through this file"
```

**Operational Entry Point:**
```
Whatever folder the agent was launched in
↓
No automatic path to governance
```

**These are not the same.** This violates the governance model.

---

## DERIVATION CHAIN BREAK

### Documented Chain

```
papers (WE4FREE research)
  ↓ derived-from (concepts)
Archivist-Agent (governance implementation)
  ↓ integration-target
SwarmMind (core system integration)
```

### Actual Runtime Chain

```
SwarmMind (launched in isolation)
  ✗ (no link to Archivist-Agent)
  ✗ (no link to governance)
  ✗ (derivation chain broken)
```

---

## CONFIGURATION GAP

### What Existed

- `S:\Archivist-Agent\BOOTSTRAP.md` — Single entry point (documented)
- `S:\Archivist-Agent\registry\PROJECT_REGISTRY.md` — Project catalog
- `S:\Archivist-Agent\swarmmind-governance-extension\` — Integration code
- Human understanding of relationship

### What Was Missing

- Machine-readable project manifest in SwarmMind
- Runtime resolver to discover governance
- Executable inheritance chain
- Startup sequence to load governance context

---

## FAILURE CLASS

**Context-Boundary Failure**

- Human sees: Multi-project system with governance hierarchy
- Runtime sees: Only current repo, isolated
- Result: Governance inheritance is **implicit to human** but **invisible to agent**

---

## THE FIX

### What Was Implemented

#### 1. GOVERNANCE_MANIFEST.json

Machine-readable project relationship declaration:

```json
{
  "project": { "name": "SwarmMind", "type": "core" },
  "governance": {
    "inherits_from": "S:\\Archivist-Agent",
    "bootstrap_path": "S:\\Archivist-Agent\\BOOTSTRAP.md",
    "relationship": "integration-target",
    "extension_path": "S:\\Archivist-Agent\\swarmmind-governance-extension"
  },
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

#### 2. scripts/resolve-governance-v2.js

Resolver that handles **three runtime modes**:

```
project start
  ↓
look for local project manifest
  ↓
determine runtime mode (3 options)
  ↓
  ├─► governed-standalone (governance_active=true, external_lane=true)
  │    ↓ resolve parent → load bootstrap → full enforcement
  │
  ├─► standalone-lattice (governance_active=false, external_lane=true)
  │    ↓ skip parent → setup external lane → annotation-only
  │
  └─► isolated-demo (governance_active=false, external_lane=false)
       ↓ skip all → local-only execution
```

#### 3. scripts/governed-start.js

Startup wrapper that:
- Runs governance resolver first
- Injects governance context into app
- Continues with normal SwarmMind execution

---

## WHAT THIS FIXES

### Before

- Agent launched in SwarmMind → isolated operation
- No discovery of parent governance
- Extension invisible at runtime
- Derivation chain broken

### After

- Agent launched in SwarmMind → reads GOVERNANCE_MANIFEST.json
- Resolver discovers Archivist-Agent parent
- Bootstrap path verified
- Governance context loaded
- Extension hooks exposed
- Derivation chain restored

---

## GOVERNANCE COMPLIANCE

### BOOTSTRAP.md Requirements

From `S:\Archivist-Agent\BOOTSTRAP.md`:

> "ONE ENTRY POINT → ALL PATHS ROUTE THROUGH IT → NO DUPLICATES"

**This fix restores that rule:**

1. SwarmMind manifest declares parent
2. Resolver loads parent BOOTSTRAP
3. All logic routes through declared entry point
4. No duplicate governance logic

### SESSION_INIT.md Requirements

From `S:\Archivist-Agent\SESSION_INIT.md`:

> "Before taking ANY action, you MUST:
> 1. READ BOOTSTRAP.MD
> 2. ACKNOWLEDGE GOVERNANCE CONSTRAINTS
> 3. STATE YOUR DRIFT BASELINE
> 4. DECLARE VERIFICATION LANE"

**This fix enables that protocol:**

- Governance context available at startup
- Agent can now read BOOTSTRAP before proceeding
- Constraints can be acknowledged
- Session initialization possible

---

## VALIDATION

### Test Sequence

1. Run `node scripts/resolve-governance.js`
2. Verify output shows:
   - Manifest detected
   - Parent resolved
   - Bootstrap verified
   - Governance context loaded
   - Extension hooks exposed
3. Check `GOVERNANCE_RESOLUTION.json` created
4. Run `node scripts/governed-start.js`
5. Verify SwarmMind starts with governance context

### Success Criteria

- [x] Manifest file created
- [x] Resolver script implemented
- [x] Startup wrapper created
- [ ] Test execution pending
- [ ] Integration with Kilo config pending

---

## REMAINING WORK

### High Priority

1. **Test the resolver** — Execute and verify output
2. **Update kilo.json** — Add governance awareness to Kilo configuration
3. **Document usage** — Add to README.md

### Medium Priority

4. **Integrate with app.js** — Make governance context available to agents
5. **Add to verification** — Include in system checks
6. **Create governance-aware agent** — Agent that reads BOOTSTRAP before execution

### Low Priority

7. **Add fallback behavior** — Graceful degradation if parent unavailable
8. **Create resolver for other projects** — Federation, TAKE10, kucoin-margin-bot
9. **Document pattern** — Add to Archivist-Agent governance docs

---

## RELATIONSHIP TO OTHER FILES

This fix addresses the failure documented in:

- `S:\Archivist-Agent\SESSION_STATE_2026-04-16_COMPACT.md`
- `S:\Archivist-Agent\.artifacts\SWARMIND_INTEGRATION_SPEC.md`
- `S:\Archivist-Agent\.artifacts\SWARMIND_GOVERNANCE_EXTENSION_STATUS.md`
- `S:\Archivist-Agent\registry\PROJECT_REGISTRY.md`
- `S:\Archivist-Agent\registry\DERIVATION_MAP.md`

---

## KEY INSIGHT

> "The extension exists in the file tree, but not in the runtime derivation chain."

This fix makes the project relationship **executable**, not just documented.

---

## VERSION CONTROL

**Created:** 2026-04-16
**Author:** Governance Architecture Fix
**Status:** Implementation complete, testing pending
**Next Action:** Run resolver and verify governance context loads

---

**End of Failure Report**
