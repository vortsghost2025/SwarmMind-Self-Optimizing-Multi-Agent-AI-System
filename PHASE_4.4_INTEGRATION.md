# SwarmMind - Phase 4.3/4.4 Attestation & Recovery Integration

## Summary

SwarmMind now has complete integration with Archivist's Phase 4.3/4.4 attestation and recovery orchestration.

## Implemented Components

### 1. Canonical Constants (`constants.js`)
- `TRUST_STORE_PATH`: Canonical trust store location
- `TRUST_STORE_VERSION`: Schema version check (1.0)
- `VERIFY_REASON`: All error codes including quarantine statuses
- `QUARANTINE_MAX_RETRIES`: 3
- `QUARANTINE_BACKOFF_MS`: 5000
- `QUARANTINE_LOG_PATH`: Quarantine event log
- `HANDOFF_SIGNAL_FILE`: Agent handoff marker

### 2. Lane Consistency Enforcement (A = B = C)
All three identity assertions MUST match:
- A: `laneId` argument used to fetch public key
- B: `payload.lane` embedded in signed payload
- C: `outer.lane` declared in envelope

**Enforcement Order:**
1. Parse outer payload
2. Require `payload.lane` → FAIL: `MISSING_LANE`
3. Compare `payload.lane` to `outer.lane` → FAIL: `LANE_MISMATCH`
4. Fetch trust-store key for that lane
5. Perform crypto verification

### 3. Core Modules

**Verifier.js** - Updated:
- Uses canonical `TRUST_STORE_PATH` from constants
- Schema version check
- Required `keys` object validation
- A = B = C lane consistency enforcement
- Returns `MISSING_LANE`, `LANE_MISMATCH` with notes
- Legacy `origin_lane` normalization

**Signer.js** - Updated:
- Canonical `lane` field in all signed payloads
- Uses `stableStringify()` for deterministic serialization
- `signQueueItem()` migrates `origin_lane` → `lane`
- `signContinuityRecord()` uses canonical `lane` field

**stableStringify.js** - New:
- Deterministic JSON serialization
- Prevents false negatives from `JSON.stringify()` non-determinism

### 4. Quarantine Orchestration Layer

**PhenotypeStore.js** - New:
- Persists last known synchronized phenotype per lane
- Enables drift detection via hash comparison
- Supports rollback during quarantine loop

**QuarantineManager.js** - New:
- Quarantine loop with retry limits (default: 3)
- Exponential backoff (5s × retryCount)
- Event logging to `quarantine.log`
- Handoff signal (`AGENT_HANDOFF_REQUIRED.md`) when max exceeded
- Metrics collection per lane

**VerifierWrapper.js** - New:
- Unified verification entry point
- Orchestrates: identity checks → crypto verification → quarantine loop
- Integrates PhenotypeStore for successful verification tracking
- Automatically releases items from quarantine on successful retry
- **RecoveryEngine integration** on failure

### 5. RecoveryEngine Integration

**RecoveryClient.js** - New:
- HTTP client for posting failed artifacts to Archivist's `/orchestrate/recovery`
- Health check endpoint: `GET /orchestrate/health`
- Automatic retry on network failure
- Integration helper for VerifierWrapper

**Example payload:**
```json
{
  "artifact": {
    "id": "...",
    "lane": "swarmmind",
    "signature": "..."
  },
  "outerLane": "swarmmind",
  "failureReason": "SIGNATURE_MISMATCH"
}
```

## Test Coverage

### Lane Consistency Tests (5/5 passing)
- `MISSING_LANE` - payload without lane field ✅
- `LANE_MISMATCH` - payload.lane differs from outer lane ✅
- Valid matching lanes ✅
- Legacy `origin_lane` normalization ✅
- Schema version check ✅

### Quarantine Orchestration Tests (8/8 passing)
- PhenotypeStore set/get ✅
- PhenotypeStore drift detection ✅
- QuarantineManager basic quarantine ✅
- QuarantineManager max retries ✅
- QuarantineManager release ✅
- VerifierWrapper valid verification ✅
- VerifierWrapper lane mismatch quarantine ✅
- VerifierWrapper metrics ✅

### RecoveryClient Tests (7/7 passing)
- Health check ✅
- Missing lane detection ✅
- Lane mismatch handling ✅
- Valid artifact acceptance ✅
- Signature mismatch handling ✅
- VerifierWrapper integration ✅
- Retry logic ✅

**Total: 20 tests passing**

## Usage Example

```javascript
const { RecoveryClient } = require('./src/attestation/RecoveryClient.js');
const { VerifierWrapper } = require('./src/attestation/VerifierWrapper.js');

// Configure with RecoveryEngine endpoint
const recoveryClient = new RecoveryClient({
  host: 'localhost',
  port: 3000,
  protocol: 'http'
});

const wrapper = new VerifierWrapper({
  recoveryClient: recoveryClient,
  submitToRecovery: true  // Auto-submit failures to RecoveryEngine
});

// Verify item
const result = await wrapper.verify(item);

if (!result.valid) {
  console.log('Verification failed:', result.reason);
  if (result.recoveryId) {
    console.log('Submitted to RecoveryEngine:', result.recoveryId);
  }
}
```

## Cross-Lane Integration

SwarmMind is now ready for cross-lane integration:

1. **Trust Store**: All lanes use `S:\Archivist-Agent\.trust\keys.json`
2. **Lane Consistency**: A = B = C invariant enforced
3. **Recovery Flow**: Failed artifacts POST to RecoveryEngine
4. **Quarantine Loop**: 3 retries with 5s backoff
5. **Handoff Signal**: `AGENT_HANDOFF_REQUIRED.md` when human intervention needed

## Next Steps

Awaiting Library integration before proceeding with:
- Cross-lane verification tests
- End-to-end recovery flow validation
- QueueConsumer orchestration integration
