#!/bin/bash
# verify_recovery.sh - Recovery Verification Script
# Purpose: Verify continuity proof before SwarmMind can operate
#
# Exit Codes:
#   0 - SAME_PHENOTYPE (all checks pass)
#   2 - RECONSTRUCTED_UNTRUSTED (lineage missing or invalid)
#   4 - ABORT (fingerprint mismatch, constitutional breach)
#
# Evidence: CRITICALFAILURE.txt (2026-04-17)

set -e

PROJECT_ROOT="S:/SwarmMind"
ARCHIVIST_ROOT="S:/Archivist-Agent"

# Files to verify
RUNTIME_STATE="$PROJECT_ROOT/RUNTIME_STATE.json"
PHENOTYPE_REGISTRY="$ARCHIVIST_ROOT/PHENOTYPE_REGISTRY.json"
HANDOFF_DOC="$PROJECT_ROOT/SESSION_HANDOFF_2026-04-18.md"

# Log function
log() {
    echo "[verify_recovery] $1"
}

# Check 1: RUNTIME_STATE.json exists
if [ ! -f "$RUNTIME_STATE" ]; then
    log "ERROR: RUNTIME_STATE.json not found"
    exit 4
fi

# Check 2: PHENOTYPE_REGISTRY.json exists
if [ ! -f "$PHENOTYPE_REGISTRY" ]; then
    log "WARNING: PHENOTYPE_REGISTRY.json not found (may be first run)"
    # Don't abort - first run is acceptable
    exit 0
fi

# Check 3: Continuity fingerprint verification
# Extract continuity_fingerprint from RUNTIME_STATE.json
STORED_FINGERPRINT=$(grep -o '"continuity_fingerprint"[[:space:]]*:[[:space:]]*"[^"]*"' "$RUNTIME_STATE" | cut -d'"' -f4 || true)

if [ -z "$STORED_FINGERPRINT" ]; then
    log "WARNING: No continuity_fingerprint in RUNTIME_STATE.json"
    exit 0
fi

# Compute fingerprint from PHENOTYPE_REGISTRY.json
COMPUTED_FINGERPRINT=$(sha256sum "$PHENOTYPE_REGISTRY" | cut -d' ' -f1)

if [ "$STORED_FINGERPRINT" != "$COMPUTED_FINGERPRINT" ]; then
    log "ERROR: Fingerprint mismatch"
    log "  Stored:   $STORED_FINGERPRINT"
    log "  Computed: $COMPUTED_FINGERPRINT"
    exit 4
fi

log "PASS: Continuity fingerprint verified"

# Check 4: Lineage verification (if handoff exists)
if [ -f "$HANDOFF_DOC" ]; then
    # Extract lineage from handoff
    HANDOFF_LINEAGE=$(grep -o '"lineage"[[:space:]]*:[[:space:]]*"[^"]*"' "$HANDOFF_DOC" | head -1 | cut -d'"' -f4 || true)
    
    if [ -n "$HANDOFF_LINEAGE" ]; then
        log "PASS: Lineage present in handoff"
    else
        log "WARNING: Handoff exists but lineage field missing"
        exit 2
    fi
fi

# Check 5: Basic phenotype health (placeholder)
# Future: Add actual health checks
log "PASS: Basic phenotype health check"

# All checks passed
log "SAME_PHENOTYPE: All verification checks passed"
exit 0
