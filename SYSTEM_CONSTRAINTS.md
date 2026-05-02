# SYSTEM CONSTRAINTS: Lane Sovereignty Rules

## Version: 2026-05-02
## Status: MANDATORY
## Purpose: Prevent Cross-Lane Dependency Regression

---

## 🚨 RULE 0: NO CROSS-LANE CODE IMPORTS

**Violation:** Any lane importing code from another lane

**Examples of VIOLATIONS:**
```javascript
// ❌ NEVER: Absolute path imports
const util = require('S:/kernel-lane/scripts/atomic-write-util');
const { x } = require('S:/Archivist-Agent/.global/something');
const lib = require('S:/self-organizing-library/scripts/thing');

// ❌ NEVER: Dynamic path to other lanes
const path = require('path');
const KERNEL_ROOT = 'S:/kernel-lane';
const { y } = require(path.join(KERNEL_ROOT, 'scripts', 'tool.js'));
```

**Required Pattern:**
```javascript
// ✅ ALWAYS: Local implementations only
const { atomicWrite } = require('./util/atomic-write');
const { messaging } = require('./util/messaging');

// ✅ Allowed: Internal module resolution
const local = require('./local-module');
const util = require('./util/helper');
```

---

## 🚨 RULE 1: SOVEREIGN TERRITORY

**Each lane is a sovereign execution boundary.**

**Requirements:**
- ✅ All code executed within a lane MUST be local to that lane
- ✅ Shared patterns documented in contracts, never shared code
- ✅ Each lane maintains local copies of needed utilities
- ✅ "Inspired by" is allowed, "copied from" is tracked and local

**Documentation Standard:**
```javascript
/**
 * LOCAL UTILITY: <purpose>
 * ORIGIN: <source if inspired by another lane>
 * LAST SYNC: <date>
 * 
 * Note: Maintained locally for lane sovereignty.
 * Cross-lane dependencies prohibited.
 */
```

---

## 🚨 RULE 2: ABSOLUTE PATH BAN

**Hardcoded paths to other lanes are prohibited.**

**Prohibited:**
```javascript
const ARCHIVIST_PATH = 'S:/Archivist-Agent';
const LIBRARY_INBOX = 'S:/self-organizing-library/lanes/library/inbox/';
const KERNEL_UTIL = 'S:/kernel-lane/scripts/util.js';
```

**Rationale:** These create:
- Hidden dependencies
- Navigation confusion
- Trust verification failures
- Blind-middle-loop cognitive load

---

## 🚨 RULE 3: MESSAGE-ONLY INTER-LANE COMMUNICATION

**Lanes coordinate exclusively through messages.**

**Allowed:**
- ✅ Message passing via inbox/outbox
- ✅ Contract-based schemas
- ✅ Provenance headers
- ✅ Content negotiation through messages

**Prohibited:**
- ❌ Direct filesystem access to other lanes
- ❌ Shared code directories
- ❌ Require/import of other lane code
- ❌ Cross-lane dynamic resolution

---

## 🚨 RULE 4: UTILITY LOCALIZATION

**Every lane maintains its own utility implementations.**

**Required Directory Structure:**
```
<lane-root>/
├── scripts/
│   ├── util/              ← Local utilities
│   │   ├── atomic-write.js
│   │   ├── messaging.js
│   │   └── verification.js
│   ├── domain/            ← Lane-specific logic
│   └── tasks/             ← Task implementations
├── data/                  ← Local state
└── contracts/             ← Shared interface definitions
```

**Origin Tracking:**
```javascript
// File: scripts/util/atomic-write.js
/**
 * Atomic Write Utility
 * ORIGIN: Pattern from kernel-lane (2026-04-30)
 * LOCALIZED: SwarmMind adaptation (2026-05-02)
 * PURPOSE: Sovereign implementation for SwarmMind autonomy
 */
```

---

## 🚨 RULE 5: CONTRACT-BASED SHARED INTERFACES

**Shared patterns formalized as contracts, never code.**

**Example Contract:**
```json
// contracts/atomic-write-interface.json
{
  "interface": "atomic-write",
  "version": "1.0",
  "methods": {
    "write": {
      "signature": "async function(filePath, data, options)",
      "returns": "{ success: boolean, path: string, error?: string }",
      "guarantees": [
        "Atomic operation (all-or-nothing)",
        "Leasing to prevent concurrent writes",
        "Verification of written content"
      ]
    }
  }
}
```

**Implementation:**
- Each lane implements contracts independently
- No shared implementation code
- Conformance verified through testing

---

## 🚨 RULE 6: REGRESSION PREVENTION

**Automated enforcement of sovereignty rules.**

**Required in Every Lane:**

1. **Sovereignty Scanner** (`scripts/sovereignty-enforcer.js`)
   - Scans for cross-lane violations
   - Blocks commits with violations
   - Reports to lane operator

2. **Pre-Commit Hook**
   ```bash
   #!/bin/bash
   node scripts/sovereignty-enforcer.js --strict
   if [ $? -ne 0 ]; then
     echo " Sovereignty violations detected - commit blocked"
     exit 1
   fi
   ```

3. **CI Integration**
   ```yaml
   # CI workflow
   - name: Sovereignty Check
     run: node scripts/sovereignty-enforcer.js
   ```

---

## 🚨 RULE 7: VIOLATION HANDLING

**When violations are discovered:**

1. **Immediate Quarantine**
   - Flag violating code
   - Prevent further execution
   - Alert all lane operators

2. **Local Remediation**
   - Create local implementation
   - Remove cross-lane dependency
   - Document origin tracking

3. **Verification**
   - Re-scan after fix
   - Confirm sovereignty restored
   - Update regression tests

4. **Prevention**
   - Add specific test for this pattern
   - Document in team knowledge base
   - Review in standup

---

## 🚨 EMERGENCY PROCEDURES

### If You Discover a Violation:

1. **Do Not Execute** the violating code path
2. **Document** the violation location
3. **Create Local Copy** of any needed utility
4. **Remove Cross-Lane Reference**
5. **Verify** sovereignty restored
6. **Report** to all operators

### Critical Violations (>10 instances):

1. **Stop all work** in affected areas
2. **Alert all lane operators**
3. **Emergency remediation session**
4. **Full regression test**
5. **Deploy fixes simultaneously**

---

## 📋 COMPLIANCE CHECKLIST

**Before Any Commit:**

- [ ] No absolute paths to other lanes
- [ ] No require() of other lane code
- [ ] All utilities are local (./util/)
- [ ] Origin tracking present for inspired code
- [ ] Sovereignty scanner passes
- [ ] Tests verify local implementation
- [ ] Documentation updated

**Review Checklist:**

- [ ] Peer reviewer confirms sovereignty
- [ ] CI/CD pipeline passes sovereignty check
- [ ] No new cross-lane dependencies introduced
- [ ] Shared contracts referenced correctly

---

## 🎯 ENFORCEMENT TIMELINE

**Immediate (Now):**
- All new code must follow sovereignty rules
- Existing violations documented
- Emergency fixes for critical paths

**Within 24 Hours:**
- Sovereignty scanner deployed to all lanes
- Pre-commit hooks installed
- Team briefed on violation patterns

**Within 1 Week:**
- All known violations remediated
- Regression tests added
- Compliance dashboard operational

**Ongoing:**
- Daily sovereignty scans
- Weekly violation reviews
- Continuous contract refinement

---

## 🔍 DETECTION & MONITORING

**Automated Detection:**
```bash
# Run sovereignty scanner
node scripts/sovereignty-enforcer.js

# Continuous monitoring
npm run watch:sovereignty
```

**Manual Checks:**
```bash
# Search for violations
grep -r "S:/(Archivist|Kernel|Library|SwarmMind)" scripts/

# Check for require() in files
find scripts/ -name "*.js" -exec grep -l "require.*S:/" {} \;
```

**Dashboard:**
- Real-time violation count
- Trend analysis
- Lane-by-lane compliance
- Historical tracking

---

## 📚 ADDITIONAL RESOURCES

- Sovereignty Scanner: `scripts/sovereignty-enforcer.js`
- Cross-Lane Dependency Map: `docs/cross-lane-dependencies.md`
- Contract Templates: `contracts/`
- Emergency Procedures: `docs/emergency-sovereignty-breach.md`

---

## 🔐 WHY THIS MATTERS

**For Blind-Middle-Loop Operations:**
- Clear boundaries = Clear trust
- No hidden dependencies = No surprises
- Local verification = Verifiable truth
- Reduced cognitive load = Better navigation

**For System Integrity:**
- Reproducible builds
- Isolated failures
- Clear ownership
- Reliable coordination

**For Team Velocity:**
- Parallel development
- Reduced coordination overhead
- Faster debugging
- Confident deployments

---

## ⚖️ BALANCING FREEDOM & CONSTRAINTS

**Maximum Freedom Within Boundaries:**

✅ **Unrestricted:**
- Implementation patterns within lane
- Technology choices (Node.js, Python, etc.)
- Architecture decisions (local only)
- Development methodologies

🔒 **Standardized:**
- Inter-lane message formats
- Contract definitions
- Provenance tracking
- Sovereignty enforcement

**Rationale:** These constraints enable freedom by:
- Removing coordination friction
- Ensuring predictable interfaces
- Preventing hidden coupling
- Supporting autonomous operation

---

## 🚨 VIOLATION REPORTING

**Report violations immediately:**
```
Format: [Lane] [File] [Line] [Violation Type] [Description]
Example: Archivist scripts/activate-identity.js:10 absolute_path Hardcoded path to Kernel
```

**Emergency Hotline:** Lane operator on-call
**Escalation:** All lane operators + system architect

---

## ✅ FINAL AUTHORITY

**These constraints are:**
- Mandatory for all development
- Enforced by automated systems
- Reviewed and updated by team consensus
- Binding on all contributors

**Questions or concerns?**
- Discuss in team standup
- Propose alternatives in pull request
- Document exceptions with approval
- Review and iterate regularly

---

## 📝 CHANGE LOG

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-05-02 | 1.0 | Initial sovereignty constraints | System Consensus |
| 2026-05-02 | 1.1 | Added emergency procedures | All Lanes |

**Last Updated:** 2026-05-02T12:00:00-04:00  
**Next Review:** 2026-05-09T09:00:00-04:00

═══════════════════════════════════════════════════════════════
**These constraints exist to protect your workflow.**  
**Your autonomy within boundaries is absolute.**  
**Cross-lane sovereignty enables system trust.**  
═══════════════════════════════════════════════════════════════
