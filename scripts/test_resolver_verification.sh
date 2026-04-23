#!/bin/bash
# test_resolver_verification.sh
# CI Test: Verify that resolve-governance-v2.js calls verify_recovery.sh
#
# Purpose: Prevent regression where resolver skips verification
# Evidence: CRITICAL_FIX_LOG_2026-04-17.md
#
# Exit Codes:
# 0 - Test passed (verification is called)
# 1 - Test failed (verification not found in resolver)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RESOLVER_PATH="$PROJECT_ROOT/scripts/resolve-governance-v2.js"
VERIFY_SCRIPT="$PROJECT_ROOT/verify_recovery.sh"

echo "[TEST] Checking resolver verification integration..."

# Check 1: Resolver file exists
if [ ! -f "$RESOLVER_PATH" ]; then
    echo "[FAIL] Resolver not found: $RESOLVER_PATH"
    exit 1
fi
echo "[PASS] Resolver exists"

# Check 2: verify_recovery.sh exists
if [ ! -f "$VERIFY_SCRIPT" ]; then
    echo "[FAIL] verify_recovery.sh not found: $VERIFY_SCRIPT"
    exit 1
fi
echo "[PASS] verify_recovery.sh exists"

# Check 3: Resolver contains verification call
if ! grep -q "verify_recovery.sh" "$RESOLVER_PATH"; then
    echo "[FAIL] Resolver does not reference verify_recovery.sh"
    exit 1
fi
echo "[PASS] Resolver references verify_recovery.sh"

# Check 4: Resolver contains verification block comment
if ! grep -q "RECOVERY VERIFICATION" "$RESOLVER_PATH"; then
    echo "[FAIL] Resolver missing verification block documentation"
    exit 1
fi
echo "[PASS] Resolver contains verification block"

# Check 5: Resolver aborts on fingerprint mismatch (exit code 4)
if ! grep -q "ABORT.*FINGERPRINT" "$RESOLVER_PATH"; then
    echo "[FAIL] Resolver does not handle fingerprint mismatch abort"
    exit 1
fi
echo "[PASS] Resolver handles fingerprint mismatch"

# Check 6: Resolver handles untrusted reconstruction (exit code 2)
if ! grep -q "RECONSTRUCTED_UNTRUSTED" "$RESOLVER_PATH"; then
    echo "[FAIL] Resolver does not handle untrusted reconstruction"
    exit 1
fi
echo "[PASS] Resolver handles untrusted reconstruction"

# Check 7: Resolver actually executes the verification script
if ! grep -q 'execSync.*verifyScript' "$RESOLVER_PATH"; then
    echo "[FAIL] Resolver does not execute verify_recovery.sh"
    exit 1
fi
echo "[PASS] Resolver executes verification script"

echo ""
echo "[SUCCESS] All resolver verification integration tests passed"
exit 0
