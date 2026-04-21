/**
 * Shared-trust integration test: SwarmMind signs, verifier resolves via explicit trust-store path.
 * Uses a deterministic local fixture path (no cross-repo mutation).
 *
 * Run: node scripts/test-shared-trust.js
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

function cleanup(trustStorePath, queueDir, identityDir) {
	// Remove trust store file if we created it
	if (fs.existsSync(trustStorePath)) fs.unlinkSync(trustStorePath);
	// Clean queue directory
	if (fs.existsSync(queueDir)) fs.rmSync(queueDir, { recursive: true, force: true });
	// Clean identity
	if (fs.existsSync(identityDir)) fs.rmSync(identityDir, { recursive: true, force: true });
	// Also clean .trust directory if empty? Not needed.
}

async function run() {
	console.log('Testing Shared Trust Flow (fixture path)...\n');

	// Define deterministic local fixture path
	const trustStorePath = path.join(process.cwd(), '.test-shared-trust', 'keys.json');
	const queueDir = path.join(process.cwd(), 'queue');
	const identityDir = path.join(process.cwd(), '.identity');

	// Ensure fixture directory exists
	const trustDir = path.dirname(trustStorePath);
	if (!fs.existsSync(trustDir)) fs.mkdirSync(trustDir, { recursive: true });

	// Cleanup before test
	cleanup(trustStorePath, queueDir, identityDir);

	// Setup environment
	process.env.LANE_NAME = 'swarmmind';
	process.env.LANE_KEY_PASSPHRASE = 'test-shared-trust-pass';

	// Generate keys
	const km = new KeyManager({ laneId: 'swarmmind' });
	km.initialize(process.env.LANE_KEY_PASSPHRASE);
	const pubInfo = km.exportForTrustStore();

	// Write public key to canonical trust store using proper schema
	// We'll write a minimal trust store with keys object
	const trustStoreData = {
		version: '1.0',
		keys: {
			[pubInfo.lane_id]: pubInfo
		},
		migration: {},
		updated_at: new Date().toISOString()
	};
	fs.writeFileSync(trustStorePath, JSON.stringify(trustStoreData, null, 2));
	console.log(`✓ Trust store fixture written to ${trustStorePath}`);

	// Now create Signer and Verifier (Verifier loads explicit fixture path)
	const signer = new Signer();
	const verifier = new Verifier({ trustStorePath });
	// Verify that verifier actually loaded the key
	if (!verifier.trustStore.keys?.[pubInfo.lane_id]) {
		console.error('❌ Verifier did not load key from trust store. Keys:', Object.keys(verifier.trustStore.keys || {}));
		process.exit(1);
	}
	console.log('✓ Verifier loaded trust store from explicit fixture path');

	// Configure Queue (includes keyManager)
	Queue.setAttestation(signer, verifier, km);
	const q = new Queue('SHARED_TRUST');
	if (fs.existsSync(q.filePath)) fs.unlinkSync(q.filePath);
	fs.writeFileSync(q.filePath, '', { flag: 'wx' });

	// Enqueue
	const item = q.enqueue({
		target_lane: 'archivist',
		type: 'incident_report',
		payload: { shared: true }
	});
	assert(item.signature, 'Item should have signature');

	// Verify via verifier that reads from fixture trust store (already loaded)
	// Use verifyAgainstTrustStore to verify signature against stored public key
	const verifyResult = verifier.verifyAgainstTrustStore(item.signature, 'swarmmind');
	assert(verifyResult.valid, 'Signature should verify against canonical trust store');
	console.log('✓ Signature verified using fixture trust store');

	// Status transition also verifies and re-signs
  const updated = await q.updateStatus(item.id, 'accepted', 'processed');
	assert(updated.signature, 'Updated item should remain signed');
	const verify2 = verifier.verifyAgainstTrustStore(updated.signature, 'swarmmind');
	assert(verify2.valid, 'Updated signature should also verify');
	console.log('✓ Status transition preserved signature integrity');

	// Cleanup
	cleanup(trustStorePath, queueDir, identityDir);

	console.log('\n✓ Shared-trust integration test passed');
	process.exit(0);
}

run().catch(e => {
	console.error('Test failed:', e);
	process.exit(1);
});
