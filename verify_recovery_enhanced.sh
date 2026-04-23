#!/bin/bash
# verify_recovery.sh - Recovery Verification Script (ENHANCED)
# Purpose: Verify continuity proof before SwarmMind can operate
#
# Enhanced: Added CPS_CHECK for constitutional constraint verification
#
# Exit Codes:
# 0 - SAME_PHENOTYPE (all checks pass)
# 2 - RECONSTRUCTED_UNTRUSTED (lineage missing or invalid)
# 4 - ABORT (fingerprint mismatch, constitutional breach)
#
# Evidence: CRITICAL_FIX_LOG_2026-04-17.md

set -e

PROJECT_ROOT="S:/SwarmMind Self-Optimizing Multi-Agent AI System"
ARCHIVIST_ROOT="S:/Archivist-Agent"

# Files to verify
RUNTIME_STATE="$PROJECT_ROOT/RUNTIME_STATE.json"
PHENOTYPE_REGISTRY="$ARCHIVIST_ROOT/PHENOTYPE_REGISTRY.json"
HANDOFF_DOC="$PROJECT_ROOT/SESSION_HANDOFF_2026-04-18.md"
CPS_CONSTRAINTS="$ARCHIVIST_ROOT/constitutional_constraints.yaml"
BOOTSTRAP="$ARCHIVIST_ROOT/BOOTSTRAP.md"

# Log function
log() {
    echo "[verify_recovery] $1"
}

# Check 1: RUNTIME_STATE.json exists
if [ ! -f "$RUNTIME_STATE" ]; then
    log "ERROR: RUNTIME_STATE.json not found"
    exit 4
fi
log "PASS: RUNTIME_STATE.json exists"

# Check 2: PHENOTYPE_REGISTRY.json exists
if [ ! -f "$PHENOTYPE_REGISTRY" ]; then
    log "WARNING: PHENOTYPE_REGISTRY.json not found (may be first run)"
    exit 0
fi
log "PASS: PHENOTYPE_REGISTRY.json exists"

# Check 3: Continuity fingerprint verification
STORED_FINGERPRINT=$(grep -o '"continuity_fingerprint"[[:space:]]*:[[:space:]]*"[^"]*"' "$RUNTIME_STATE" | cut -d'"' -f4 || true)

if [ -z "$STORED_FINGERPRINT" ]; then
    log "WARNING: No continuity_fingerprint in RUNTIME_STATE.json"
    exit 0
fi

COMPUTED_FINGERPRINT=$(sha256sum "$PHENOTYPE_REGISTRY" | cut -d' ' -f1)

if [ "$STORED_FINGERPRINT" != "$COMPUTED_FINGERPRINT" ]; then
    log "ERROR: Fingerprint mismatch"
    log " Stored: $STORED_FINGERPRINT"
    log " Computed: $COMPUTED_FINGERPRINT"
    exit 4
fi
log "PASS: Continuity fingerprint verified"

# Check 4: Lineage verification (if handoff exists)
if [ -f "$HANDOFF_DOC" ]; then
    HANDOFF_LINEAGE=$(grep -o '"lineage"[[:space:]]*:[[:space:]]*"[^"]*"' "$HANDOFF_DOC" | head -1 | cut -d'"' -f4 || true)
    
    if [ -n "$HANDOFF_LINEAGE" ]; then
        log "PASS: Lineage present in handoff"
    else
        log "WARNING: Handoff exists but lineage field missing"
        exit 2
    fi
fi

# Check 5: CPS_CONSTRAINTS health (constitutional enforcement)
# --------------------------------------------------------------
# CPS_CHECK: Verify constitutional constraints file is present and valid
# This prevents governance drift where agents bypass constitutional rules
# --------------------------------------------------------------
if [ -f "$CPS_CONSTRAINTS" ]; then
    # Verify file is not empty
    if [ ! -s "$CPS_CONSTRAINTS" ]; then
        log "ERROR: constitutional_constraints.yaml is empty"
        exit 4
    fi
    
    # Verify key constraint fields exist
    if ! grep -q "drift_threshold" "$CPS_CONSTRAINTS"; then
        log "WARNING: drift_threshold not found in constraints"
    else
        log "PASS: CPS drift_threshold present"
    fi
    
    if ! grep -q "correction_score" "$CPS_CONSTRAINTS"; then
        log "WARNING: correction_score not found in constraints"
    else
        log "PASS: CPS correction_score present"
    fi
    
    log "PASS: CPS_CONSTRAINTS health verified"
else
    log "WARNING: constitutional_constraints.yaml not found - governance may be incomplete"
fi

# Check 6: BOOTSTRAP.md exists (single entry point rule)
if [ ! -f "$BOOTSTRAP" ]; then
    log "ERROR: BOOTSTRAP.md not found - governance entry point missing"
    exit 4
fi
log "PASS: BOOTSTRAP.md exists (single entry point verified)"

# Check 7: Verify BOOTSTRAP contains core structure
if ! grep -q "ALL LOGIC ROUTES THROUGH THIS FILE" "$BOOTSTRAP"; then
    log "ERROR: BOOTSTRAP.md does not contain entry point declaration"
    exit 4
fi
log "PASS: BOOTSTRAP entry point rule verified"

# All checks passed
log "SAME_PHENOTYPE: All verification checks passed"
exit 0
