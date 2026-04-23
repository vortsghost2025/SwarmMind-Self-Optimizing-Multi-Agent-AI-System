const { Verifier } = require('../src/attestation/Verifier');
const { Signer } = require('../src/attestation/Signer');
const { KeyManager } = require('../src/attestation/KeyManager');
const { ensureTestTrustStore } = require('./test-support/trustStoreFixture');
const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) {
    console.error('ASSERTION FAILED:', message);
    process.exit(1);
  }
}

async function run() {
  console.log('Testing Verifier in-process...\n');

  // Setup keys
  process.env.LANE_NAME = 'swarmmind';
  process.env.LANE_KEY_PASSPHRASE = 'test-passphrase-verifier';
  const idDir = path.join(process.cwd(), '.identity');
  if (fs.existsSync(idDir)) fs.rmSync(idDir, { recursive: true, force: true });

  const km = new KeyManager({ laneId: 'swarmmind' });
  km.initialize(process.env.LANE_KEY_PASSPHRASE);
  const signer = new Signer();
  const trustStorePath = ensureTestTrustStore({
    trustStorePath: path.join(process.cwd(), '.test-trust', 'verifier-trust-store.json'),
    reset: true
  });
  const verifier = new Verifier({ trustStorePath });
  verifier.addTrustedKey('swarmmind', km.loadPublicKey(), km.getPublicKeyInfo().key_id);

  // Test 1: sign + verify round-trip
  const passphrase = process.env.LANE_KEY_PASSPHRASE;
  const privateKey = km.loadPrivateKey(passphrase);
  const keyId = km.getPublicKeyInfo().key_id;
  const payload = { id: 'Q-TEST', timestamp: new Date().toISOString(), lane: 'swarmmind', type: 'test' };
  const signed = signer.signQueueItem(payload, privateKey, keyId);

  const vResult = verifier.verifyQueueItem(signed);
  assert(vResult.valid, `Queue item signature should verify, got: ${JSON.stringify(vResult)}`);
  console.log('Queue item signature verified');

  // Test 2: verifyAgainstTrustStore directly
  const trustResult = verifier.verifyAgainstTrustStore(signed.signature, 'swarmmind');
  assert(trustResult.valid, 'verifyAgainstTrustStore should return valid');
  console.log('Trust store verification passed');

  // Test 3: lane mismatch detection
  const badResult = verifier.verifyAgainstTrustStore(signed.signature, 'wrong-lane');
  assert(!badResult.valid, 'Wrong lane should fail verification');
  console.log('Lane mismatch correctly detected');

  // Test 4: missing signature detection
  const unsigned = { ...signed };
  delete unsigned.signature;
  const noSigResult = verifier.verifyQueueItem(unsigned);
  assert(!noSigResult.valid, 'Unsigned item should fail verification');
  console.log('Unsigned item correctly rejected');

  // Test 5: corrupted signature detection
  const corrupted = { ...signed, signature: signed.signature.slice(0, -5) + 'XXXXX' };
  const corruptResult = verifier.verifyQueueItem(corrupted);
  assert(!corruptResult.valid, 'Corrupted signature should fail verification');
  console.log('Corrupted signature correctly rejected');

  // Test 6: audit event verification
  const auditPayload = { timestamp: new Date().toISOString(), lane: 'swarmmind', event_type: 'enqueue' };
  const signedAudit = signer.signAuditEvent(auditPayload, privateKey, keyId);
  const auditResult = verifier.verifyAuditEvent(signedAudit);
  assert(auditResult.valid, 'Audit event signature should verify');
  console.log('Audit event signature verified');

  // Test 7: trust store stats
  const stats = verifier.getTrustStoreStats();
  assert(stats.total_lanes >= 1, 'Trust store should have at least 1 lane');
  assert(stats.registered >= 1, 'At least 1 registered lane');
  console.log('Trust store stats valid');

  // Cleanup
  if (fs.existsSync(idDir)) fs.rmSync(idDir, { recursive: true, force: true });

  console.log('\nAll Verifier tests passed');
  process.exit(0);
}

run().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
