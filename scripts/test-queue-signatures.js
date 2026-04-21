/**
 * Test queue item signing and verification during enqueue/status transitions
 * Run: node scripts/test-queue-signatures.js
 */

const { KeyManager } = require('../src/attestation/KeyManager');
const { Signer } = require('../src/attestation/Signer');
const { Verifier } = require('../src/attestation/Verifier');
const Queue = require('../src/queue/Queue');
const fs = require('fs');
const path = require('path');

function assert(condition, message) {
	if (!condition) {
		console.error('ASSERTION FAILED:', message);
		process.exit(1);
	}
}

function cleanup() {
	// Clean queue directory
	const queueDir = path.join(process.cwd(), 'queue');
	if (fs.existsSync(queueDir)) fs.rmSync(queueDir, { recursive: true, force: true });
	// Clean identity
	const idDir = path.join(process.cwd(), '.identity');
	if (fs.existsSync(idDir)) fs.rmSync(idDir, { recursive: true, force: true });
}

async function run() {
	console.log('Testing Queue Attestation...\n');
	cleanup();

	// Setup environment
	process.env.LANE_NAME = 'swarmmind';
	process.env.LANE_KEY_PASSPHRASE = 'test-passphrase-456';

	// Create KeyManager, Signer, Verifier
	const km = new KeyManager({ laneId: 'swarmmind' });
	km.initialize(process.env.LANE_KEY_PASSPHRASE);
	const signer = new Signer();
	const verifier = new Verifier();
	// Add our public key to verifier's trust store via direct injection
	verifier.trustStore.keys['swarmmind'] = { public_key_pem: km.loadPublicKey() };

	// Configure Queue static attestation (now includes keyManager)
	Queue.setAttestation(signer, verifier, km);

	// Create a test queue
	const q = new Queue('TEST');
	// Ensure clean file
	if (fs.existsSync(q.filePath)) fs.unlinkSync(q.filePath);
	fs.writeFileSync(q.filePath, '', { flag: 'wx' });

	// Enqueue an item
	const item = q.enqueue({
		target_lane: 'archivist',
		type: 'incident_report',
		artifact_path: null,
		required_action: 'review',
		proof_required: [],
		payload: { incident: 'test' }
	});
	assert(item.signature, 'Enqueued item should have JWS signature');
	console.log('✓ Item enqueued with signature');

	// Verify file content contains signature
	const fileContent = fs.readFileSync(q.filePath, 'utf8');
	const parsed = JSON.parse(fileContent.trim());
	assert(parsed.signature, 'Persisted item should include signature');

	// Update status — should verify signature and re-sign
  const updated = await q.updateStatus(item.id, 'accepted', 'handled');
	assert(updated.signature, 'Updated item should have signature');
	// Ensure status changed
	assert(updated.status === 'accepted', 'Status should be accepted');
	console.log('✓ Status transition succeeded with signature verification');

	// Verify that signature of updated item is valid via verifier
	const verifyResult = verifier.verifyQueueItem(updated);
	assert(verifyResult.valid, 'Updated item signature should verify');
	console.log('✓ Updated item signature verifiable');

	// Test that modifying the item's status without going through updateStatus would break signature
	const rawLines = fs.readFileSync(q.filePath, 'utf8').trim().split('\n');
	const rawItem = JSON.parse(rawLines[0]);
	// Tamper with the status in the file directly, keep same signature
	rawItem.status = 'rejected'; // not done via updateStatus, so signature invalid
	// Write back
	fs.writeFileSync(q.filePath, JSON.stringify(rawItem) + '\n');
	// Now try to updateStatus again via queue; it should fail verification on load
	let threw = false;
	try {
    const anotherUpdate = await q.updateStatus(item.id, 'superseded', 'tamper');
	} catch (e) {
		threw = true;
		console.log('✓ Tampered item detected on updateStatus attempt');
	}
	assert(threw, 'Tampered item should cause verification error');

	// Cleanup
	cleanup();
	console.log('\n✓ All queue signature tests passed');
	process.exit(0);
}

run().catch(e => {
	console.error('Test failed:', e);
	process.exit(1);
});
