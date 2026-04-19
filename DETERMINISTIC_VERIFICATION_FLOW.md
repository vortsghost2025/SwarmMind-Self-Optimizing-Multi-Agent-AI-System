# Deterministic Verification Flow - Phase 4.4 Final

## Summary of Correction

Fixed the verification flow to be fully deterministic: **identity is decided BEFORE cryptography, not inferred AFTER cryptography.**

## Previous Flow (Weak)

```
1. Get outerLane from envelope
2. verifyAgainstTrustStore(signature, outerLane)  ← uses outerLane's key
3. Read result.payload.lane
4. Compare lanes
```

**Problem:** Key selection happens before lane comparison. Some mismatches surface as `SIGNATURE_MISMATCH` instead of `LANE_MISMATCH`.

## New Flow (Strong/Deterministic)

```
1. Parse JWS without trusting it
2. Get outerLane from envelope (A)
3. Extract signedPayloadLane from JWS (B)
4. Require signedPayloadLane exists → FAIL: MISSING_LANE
5. Compare outerLane !== signedPayloadLane → FAIL: LANE_MISMATCH
6. Only NOW fetch key for agreed lane (C = A = B)
7. Verify crypto
```

**Benefit:** Identity is settled before key lookup. All lane mismatches surface as `LANE_MISMATCH`.

## Implementation

### VerifierWrapper.js Updated

```javascript
async verify(item) {
    // Step 1: Get outer lane from envelope (A)
    const outerLane = item.lane || item.origin_lane;

    // Step 2: Parse JWS without trusting it yet
    const parsed = this.verifier._parseJWS(item.signature);

    // Step 3: Extract signed payload lane (B)
    const payloadLane = parsed.payload?.lane;

    // Step 4: Require payloadLane exists
    if (!payloadLane) {
        return MISSING_LANE;
    }

    // Step 5: Compare lanes (A = B enforcement, before crypto)
    if (payloadLane !== outerLane) {
        return LANE_MISMATCH;
    }

    // Step 6: Only NOW fetch the key for the agreed lane (C = A = B)
    const publicKey = this.verifier.getPublicKey(payloadLane);

    // Step 7: Verify crypto (after identity is settled)
    return this.verifier.verify(item.signature, publicKey);
}
```

## A = B = C Invariant

- **A**: `outerLane` from envelope (`item.lane || item.origin_lane`)
- **B**: `payloadLane` from signed JWS payload (`parsed.payload.lane`)
- **C**: The lane used to fetch public key from trust store

**Enforcement:** A = B BEFORE key lookup (C).

## Clean Rule

```
Outer envelope lane      = item.lane || item.origin_lane
Inner signed lane       = parsedJws.payload.lane

Enforcement:
  missing payloadLane   → MISSING_LANE
  outerLane !== payloadLane → LANE_MISMATCH
  else fetch key for payloadLane
  then verify signature
```

## Why This Matters

**Before (weak):**
- Outer lane: swarmmind
- Signed payload lane: library
- Key fetched: swarmmind's key
- Result: SIGNATURE_MISMATCH (blurred)

**After (strong):**
- Outer lane: swarmmind
- Signed payload lane: library
- Comparison happens before key lookup
- Result: LANE_MISMATCH (correct)

## Test Results

All 20 tests passing with deterministic flow:
- Lane Consistency: 5/5 ✅
- Quarantine Orchestration: 8/8 ✅
- RecoveryClient: 7/7 ✅
