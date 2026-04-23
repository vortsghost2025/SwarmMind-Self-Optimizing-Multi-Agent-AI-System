#!/bin/bash
# claim_check.sh - Proof vs. Claim Verification Gate
# Purpose: Detect state-claim divergence before it propagates
#
# Usage: ./claim_check.sh <claim_type> <claimed_artifact> <actual_artifact>
#
# Claim Types:
#   file_exists    - Claim: file exists. Check: test -f
#   hash_match     - Claim: hashes match. Check: sha256sum comparison
#   content_match  - Claim: content identical. Check: diff
#   git_committed  - Claim: changes committed. Check: git status
#   lineage_valid  - Claim: lineage present. Check: grep lineage field
#
# Exit Codes:
# 0 - PROOF_MATCHES_CLAIM
# 1 - CLAIM_EXCEEDS_PROOF (divergence detected)
# 2 - PROOF_INSUFFICIENT (cannot verify)
# 3 - INVALID_CLAIM_TYPE
#
# Evidence: CRITICAL_FIX_LOG_2026-04-17.md

set -e

CLAIM_TYPE="$1"
CLAIMED_ARTIFACT="$2"
ACTUAL_ARTIFACT="$3"

log() {
    echo "[claim_check] $1"
}

usage() {
    echo "Usage: $0 <claim_type> <claimed_artifact> <actual_artifact>"
    echo ""
    echo "Claim Types:"
    echo "  file_exists    - Verify file exists"
    echo "  hash_match     - Verify SHA256 hashes match"
    echo "  content_match  - Verify content is identical"
    echo "  git_committed  - Verify changes are committed"
    echo "  lineage_valid  - Verify lineage field present"
    exit 3
}

if [ -z "$CLAIM_TYPE" ] || [ -z "$CLAIMED_ARTIFACT" ]; then
    usage
fi

case "$CLAIM_TYPE" in
    file_exists)
        log "Checking: file exists claim"
        if [ ! -f "$CLAIMED_ARTIFACT" ]; then
            log "FAIL: File does not exist: $CLAIMED_ARTIFACT"
            exit 1
        fi
        log "PASS: File exists"
        exit 0
        ;;

    hash_match)
        log "Checking: hash match claim"
        if [ -z "$ACTUAL_ARTIFACT" ]; then
            log "ERROR: Missing actual artifact for hash comparison"
            exit 2
        fi
        
        if [ ! -f "$CLAIMED_ARTIFACT" ] || [ ! -f "$ACTUAL_ARTIFACT" ]; then
            log "ERROR: One or both files missing"
            exit 2
        fi
        
        CLAIMED_HASH=$(sha256sum "$CLAIMED_ARTIFACT" | cut -d' ' -f1)
        ACTUAL_HASH=$(sha256sum "$ACTUAL_ARTIFACT" | cut -d' ' -f1)
        
        if [ "$CLAIMED_HASH" != "$ACTUAL_HASH" ]; then
            log "FAIL: Hash mismatch"
            log "  Claimed: $CLAIMED_HASH"
            log "  Actual:  $ACTUAL_HASH"
            exit 1
        fi
        log "PASS: Hashes match"
        exit 0
        ;;

    content_match)
        log "Checking: content match claim"
        if [ -z "$ACTUAL_ARTIFACT" ]; then
            log "ERROR: Missing actual artifact for content comparison"
            exit 2
        fi
        
        if ! diff -q "$CLAIMED_ARTIFACT" "$ACTUAL_ARTIFACT" > /dev/null 2>&1; then
            log "FAIL: Content differs"
            diff "$CLAIMED_ARTIFACT" "$ACTUAL_ARTIFACT" | head -10
            exit 1
        fi
        log "PASS: Content matches"
        exit 0
        ;;

    git_committed)
        log "Checking: git committed claim"
        GIT_DIR=$(dirname "$CLAIMED_ARTIFACT")
        GIT_FILE=$(basename "$CLAIMED_ARTIFACT")
        
        if ! git -C "$GIT_DIR" diff --quiet HEAD -- "$GIT_FILE" 2>/dev/null; then
            log "FAIL: File has uncommitted changes: $CLAIMED_ARTIFACT"
            git -C "$GIT_DIR" status --short "$GIT_FILE"
            exit 1
        fi
        log "PASS: File is committed"
        exit 0
        ;;

    lineage_valid)
        log "Checking: lineage validity claim"
        if [ ! -f "$CLAIMED_ARTIFACT" ]; then
            log "ERROR: Artifact not found: $CLAIMED_ARTIFACT"
            exit 2
        fi
        
        if ! grep -q '"lineage"' "$CLAIMED_ARTIFACT"; then
            log "FAIL: Lineage field not found in: $CLAIMED_ARTIFACT"
            exit 1
        fi
        log "PASS: Lineage field present"
        exit 0
        ;;

    *)
        log "ERROR: Invalid claim type: $CLAIM_TYPE"
        usage
        ;;
esac
