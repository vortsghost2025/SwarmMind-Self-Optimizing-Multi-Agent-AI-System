/**
 * Test harness for Identity Attestation
 * Run with: node scripts/test-attestation.js
 */
const { IdentityManager, identity, signQueueItem, verifyQueueItem } = require('../src/attestation/IdentityAttestation');

function assert(condition, message) {
  if (!condition) {
    console.error('ASSERTION FAILED:', message);
    process.exit(1);
  }
}

// Set lane for deterministic test
process.env.LANE_NAME = 'swarmmind';

// Create a sample item (simulating what Queue.enqueue produces)
const sampleItem = {
  id: 'Q-12345',
  timestamp: new Date().toISOString(),
  origin_lane: 'swarmmind',
  target_lane: 'archivist',
  type: 'approval_request',
  artifact_path: 'test.md',
  required_action: 'approve',
  payload: { test: true }
};

// Sign the item
const signed = signQueueItem(sampleItem);
assert(signed.signature, 'Signature should be present');
assert(signed.signature.length === 64, 'SHA256 hex signature should be 64 chars');

// Verify should succeed
const verifyResult = verifyQueueItem(signed);
assert(verifyResult.valid, 'Signature verification should succeed');
assert(verifyResult.reason === null, 'No failure reason');

// Tamper with item
const tampered = { ...signed, artifact_path: 'tampered.md' };
const verifyTampered = verifyQueueItem(tampered);
assert(!verifyTampered.valid, 'Tampered item should fail verification');
assert(verifyTampered.reason === 'invalid_signature', 'Failure reason should be invalid_signature');

// Missing signature
const noSig = { ...signed };
delete noSig.signature;
const verifyNoSig = verifyQueueItem(noSig);
assert(!verifyNoSig.valid, 'Item without signature should be invalid');
assert(verifyNoSig.reason === 'missing_signature', 'Failure reason should be missing_signature');

// Test identity manager directly
const im = new IdentityManager();
assert(im.getLaneId() === 'swarmmind', 'Lane ID should match environment');
const sig1 = im.sign(sampleItem);
const sig2 = im.sign(sampleItem);
assert(sig1 === sig2, 'Deterministic signing should produce same signature');

console.log('All Identity Attestation tests passed');
process.exit(0);
