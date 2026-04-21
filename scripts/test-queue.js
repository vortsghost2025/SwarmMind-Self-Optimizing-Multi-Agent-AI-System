/**
 * Simple test harness for the Queue subsystem.
 * Run with: node scripts/test-queue.js
 */
const Queue = require('../src/queue/Queue');
const { KeyManager } = require('../src/attestation/KeyManager');
const { Signer } = require('../src/attestation/Signer');
const { Verifier } = require('../src/attestation/Verifier');
const fs = require('fs');
const path = require('path');

function assert(cond, msg) {
  if (!cond) {
    console.error('ASSERTION FAILED:', msg);
    process.exit(1);
  }
}

async function run() {
  // Setup attestation
  process.env.LANE_NAME = 'swarmmind';
  process.env.LANE_KEY_PASSPHRASE = 'test-passphrase-queue';
  const idDir = path.join(process.cwd(), '.identity');
  if (fs.existsSync(idDir)) fs.rmSync(idDir, { recursive: true, force: true });
  const km = new KeyManager({ laneId: 'swarmmind' });
  km.initialize(process.env.LANE_KEY_PASSPHRASE);
  const signer = new Signer();
  const verifier = new Verifier();
  verifier.addTrustedKey('swarmmind', km.loadPublicKey(), km.getPublicKeyInfo().key_id);
  Queue.setAttestation(signer, verifier, km);

  // Use a dedicated test queue file to avoid interfering with production data
  const testQueue = new Queue('TEST');
  // Clean any previous test log
  if (fs.existsSync(testQueue.filePath)) {
    fs.unlinkSync(testQueue.filePath);
    fs.writeFileSync(testQueue.filePath, '', { flag: 'wx' });
  }

  // Enqueue two items
  const i1 = testQueue.enqueue({
    target_lane: 'library',
    type: 'verification_request',
    artifact_path: 'S:/SwarmMind/PHASE3_REPORT.md',
    required_action: 'run verification',
    proof_required: ['git log -1'],
    payload: { description: 'first test' }
  });
  const i2 = testQueue.enqueue({
    target_lane: 'archivist',
    type: 'approval_request',
    artifact_path: 'S:/SwarmMind/PHASE3_POLICY.md',
    required_action: 'approve',
    proof_required: []
  });

  assert(i1.id !== i2.id, 'IDs must be unique');
  let pending = testQueue.getPending();
  assert(pending.length === 2, 'Expected 2 pending items');

  // Transition first item to accepted
  await testQueue.updateStatus(i1.id, 'accepted', 'verification passed');
  pending = testQueue.getPending();
  assert(pending.length === 1 && pending[0].id === i2.id, 'Pending count after transition should be 1');

  // Cleanup identity dir
  if (fs.existsSync(idDir)) fs.rmSync(idDir, { recursive: true, force: true });

  console.log('All Queue tests passed');
  process.exit(0);
}

run().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
