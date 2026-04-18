# SESSION ID FRAGMENTATION FIX

**Priority:** CRITICAL
**Status:** FIX REQUIRED
**Authority Needed:** ≥80 (SwarmMind can fix own state, needs ≥100 for registry normalization)
**Estimated Time:** 15 minutes

---

## THE BUG

### Evidence

| File | SwarmMind Session ID | Status |
|------|---------------------|--------|
| `SESSION_REGISTRY.json` | `1776476695493-28240` | ✅ Correct (current session) |
| `active_agents.json` | `1776476695493-28240` | ✅ Correct (synced with registry) |
| `RUNTIME_STATE.json` | `1776399805802-28240` | ❌ **STALE** (previous session) |

### Impact

1. **Self-state drift** — RUNTIME_STATE claims wrong session ID
2. **Coordination confusion** — Upstream lanes see stale ID
3. **Trust calculation errors** — Timestamps don't match reality
4. **Recovery failures** — Cannot restore correct session state

---

## ROOT CAUSE

RUNTIME_STATE.json was created during session `1776399805802-28240` and **never updated** when session `1776476695493-28240` started.

**Missing step in session startup:**
```
SESSION_START PROTOCOL:
1. Read SESSION_REGISTRY.json
2. Acquire session lock
3. Register in SESSION_REGISTRY
4. [MISSING] Update RUNTIME_STATE.json with new session ID
5. Begin heartbeat
```

---

## THE FIX

### Part 1: Update RUNTIME_STATE.json (SwarmMind can do this)

**Current:** `S:\SwarmMind Self-Optimizing Multi-Agent AI System\RUNTIME_STATE.json`

**Before:**
```json
{
  "version": "1.0.0",
  "timestamp": "2026-04-17T04:23:25.801Z",
  
  "session": {
    "id": "1776399805802-28240",  // ❌ WRONG
    "branch": "main"
  }
}
```

**After:**
```json
{
  "version": "1.0.0",
  "timestamp": "2026-04-18T06:56:11-04:00",
  
  "session": {
    "id": "1776476695493-28240",  // ✅ CORRECT (matches SESSION_REGISTRY)
    "branch": "main"
  }
}
```

### Part 2: Add Session ID Sync to Startup Protocol

**Location:** `S:\Archivist-Agent\rules\session_start` (SESSION_REGISTRY.json:51-59)

**Current:**
```json
"session_start": [
  "Read SESSION_REGISTRY.json",
  "Read .session-mode file if present",
  "If .session-mode exists, use declared mode",
  "Otherwise default to mode: governing",
  "Check for active sessions on target lanes",
  "If mode == governing: Acquire lock file in own lane",
  "Register session in registry with mode",
  "If mode == governing: Begin heartbeat (60s interval)"
]
```

**Fixed:**
```json
"session_start": [
  "Read SESSION_REGISTRY.json",
  "Read .session-mode file if present",
  "If .session-mode exists, use declared mode",
  "Otherwise default to mode: governing",
  "Check for active sessions on target lanes",
  "If mode == governing: Acquire lock file in own lane",
  "Register session in registry with mode",
  "Update RUNTIME_STATE.json with session_id and timestamp",  // ← NEW
  "If mode == governing: Begin heartbeat (60s interval)"
]
```

---

## IMPLEMENTATION

### Step 1: Fix Current RUNTIME_STATE.json

```bash
cd "S:\SwarmMind Self-Optimizing Multi-Agent AI System"
# Read SESSION_REGISTRY to get correct session ID
SESSION_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('S:/Archivist-Agent/SESSION_REGISTRY.json')).active_sessions.swarmmind.session_id)")

# Update RUNTIME_STATE.json
node -e "
const fs = require('fs');
const state = JSON.parse(fs.readFileSync('RUNTIME_STATE.json'));
state.timestamp = new Date().toISOString();
state.session.id = '$SESSION_ID';
fs.writeFileSync('RUNTIME_STATE.json', JSON.stringify(state, null, 2));
"

# Commit fix
git add RUNTIME_STATE.json
git commit -m "[LANE-2] [FIX] Sync session ID with SESSION_REGISTRY

Cross-lane: Yes
Session: 1776476695493-28240
Issue: Session ID fragmentation causing state drift

- Updated RUNTIME_STATE.json session.id to match SESSION_REGISTRY
- Updated timestamp to current time
- Root cause: Missing session_id sync in startup protocol"

git push origin master
```

### Step 2: Update SESSION_REGISTRY Rules

```bash
cd "S:\Archivist-Agent"

# Edit SESSION_REGISTRY.json to add sync step
# Add line after "Register session in registry with mode"
# "Update RUNTIME_STATE.json with session_id and timestamp"

git add SESSION_REGISTRY.json
git commit -m "[LANE-1] [FIX] Add RUNTIME_STATE sync to session_start protocol

Cross-lane: Yes
Issue: Session ID fragmentation

- Added mandatory step to sync RUNTIME_STATE.json
- Prevents session ID drift between registry files
- Fixes root cause identified in CODE_REVIEW_3_POINTS_2026-04-18.md"

git push origin master
```

---

## VERIFICATION

After fix, all files should have matching session ID:

```bash
# Verify sync
cd "S:\Archivist-Agent"
REGISTRY_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('SESSION_REGISTRY.json')).active_sessions.swarmmind.session_id)")
AGENTS_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.runtime/active_agents.json')).agents.swarmmind.session_id)")

cd "S:\SwarmMind Self-Optimizing Multi-Agent AI System"
RUNTIME_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('RUNTIME_STATE.json')).session.id)")

echo "SESSION_REGISTRY: $REGISTRY_ID"
echo "active_agents: $AGENTS_ID"
echo "RUNTIME_STATE: $RUNTIME_ID"

# Should all output: 1776476695493-28240
```

---

## AUTHORITY CHECK

| Action | Authority Required | SwarmMind Authority | Can Proceed? |
|--------|-------------------|---------------------|--------------|
| Fix own RUNTIME_STATE.json | 80 | 80 | ✅ YES |
| Update SESSION_REGISTRY rules | 100 | 80 | ❌ NO (needs Archivist) |
| Commit to Archivist | 100 | 80 | ❌ NO |

**SwarmMind can:**
- Fix own RUNTIME_STATE.json
- Document the bug
- Propose the fix

**SwarmMind cannot:**
- Update SESSION_REGISTRY.json rules (needs authority 100)
- Commit to Archivist-Agent repo

---

## RECOMMENDATION

### Immediate (SwarmMind can do)
1. ✅ Fix `RUNTIME_STATE.json` in SwarmMind directory
2. ✅ Commit to SwarmMind repo
3. ✅ Document in INCIDENT_LOG

### Requires Archivist (authority 100)
4. ⏳ Update SESSION_REGISTRY.json session_start rules
5. ⏳ Commit to Archivist-Agent repo

---

## NEXT ACTION

**Waiting for:**
- Operator approval to fix RUNTIME_STATE.json
- Archivist activation (authority 100) to fix SESSION_REGISTRY rules

**Or:**
- Operator grants SwarmMind authority override for this specific fix

---

**Bug Documented:** 2026-04-18T06:56:11-04:00
**Status:** FIX DESIGNED, AWAITING APPROVAL

---

## STATUS TRACKING (Updated: 2026-04-18T07:07:57-04:00)

| Part | Action | Authority | Status |
|------|--------|-----------|--------|
| 1 | Fix SwarmMind RUNTIME_STATE.json | 80 | READY (awaiting approval) |
| 2 | Update SESSION_REGISTRY rules | 100 | BLOCKED |

**Artifact:** `S:/Archivist-Agent/.artifacts/SESSION_ID_FRAGMENTATION_FIX.md`

---

## HANDOFF

If another agent (or operator) needs to apply this fix:

### To Apply Part 1 (Authority 80+):
```bash
cd "S:\SwarmMind Self-Optimizing Multi-Agent AI System"

# Get correct session ID from registry
SESSION_ID="1776476695493-28240"

# Update RUNTIME_STATE.json
node -e "
const fs = require('fs');
const state = JSON.parse(fs.readFileSync('RUNTIME_STATE.json'));
state.timestamp = new Date().toISOString();
state.session.id = '$SESSION_ID';
fs.writeFileSync('RUNTIME_STATE.json', JSON.stringify(state, null, 2));
"

# Commit
git add RUNTIME_STATE.json
git commit -m "[LANE-2] [FIX] Sync session ID with SESSION_REGISTRY"
git push origin master
```

### To Apply Part 2 (Authority 100+):
```bash
cd "S:\Archivist-Agent"

# Edit SESSION_REGISTRY.json
# Add after line 73 (Register session in registry with mode):
# "Update RUNTIME_STATE.json with session_id and timestamp"

# Commit
git add SESSION_REGISTRY.json
git commit -m "[LANE-1] [FIX] Add RUNTIME_STATE sync to session_start protocol"
git push origin master
```

---

**Last Updated:** 2026-04-18T07:07:57-04:00
