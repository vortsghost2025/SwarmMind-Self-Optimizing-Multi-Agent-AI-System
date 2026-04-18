/**
 * Simple test harness for the Queue subsystem.
 * Run with: node scripts/test-queue.js
 */
const Queue = require('../src/queue/Queue');
const fs = require('fs');

function assert(cond, msg) {
  if (!cond) {
    console.error('ASSERTION FAILED:', msg);
    process.exit(1);
  }
}

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
testQueue.updateStatus(i1.id, 'accepted', 'verification passed');
pending = testQueue.getPending();
assert(pending.length === 1 && pending[0].id === i2.id, 'Pending count after transition should be 1');

console.log('All Queue tests passed');
process.exit(0);
