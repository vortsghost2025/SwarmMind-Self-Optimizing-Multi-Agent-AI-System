/**
 * Test attestation migration: dual-mode HMAC + JWS
 * Run: node scripts/test-attestation-migration.js
 */

const { KeyManager } = require('../src/attestation/KeyManager');
const { Signer } = require('../src/attestation/Signer');
const { Verifier } = require('../src/attestation/Verifier');
const Queue = require('../src/queue/Queue');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function assert(condition, message) {
	if (!condition) {
		console.error('ASSERTION FAILED:', message);
		process.exit(1);
	}
}

function cleanup() {
	const queueDir = path.join(process.cwd(), 'queue');
	if (fs.existsSync(queueDir)) fs.rmSync(queueDir, { recursive: true, force: true });
	const idDir = path.join(process.cwd(), '.identity');
	if (fs.existsSync(idDir)) fs.rmSync(idDir, { recursive: true, force: true });
}

async function run() {
	console.log('Testing Attestation Migration...\n');
	cleanup();

	process.env.LANE_NAME = 'swarmmind';
	process.env.LANE_KEY_PASSPHRASE = 'test-passphrase-migration';

	// Generate keys but we'll operate in legacy mode first
	const km = new KeyManager({ laneId: 'swarmmind' });
	km.initialize(process.env.LANE_KEY_PASSPHRASE);

	// Scenario 1: Legacy HMAC only (no signer set, but secret present)
	process.env.LANE_HMAC_SECRET = 'legacy-secret';
	const verifierLegacy = new Verifier({ allowLegacy: true });
	// For HMAC mode, we don't set signer or keyManager; queue will use HMAC fallback
	Queue.setAttestation(null, verifierLegacy, null);

	const q1 = new Queue('LEGACY');
	if (fs.existsSync(q1.filePath)) fs.unlinkSync(q1.filePath);
	fs.writeFileSync(q1.filePath, '', { flag: 'wx' });

	const item1 = q1.enqueue({ target_lane: 'self', type: 'legacy_test' });
	assert(item1.hmac, 'Item should have HMAC in legacy mode');
	const raw1 = fs.readFileSync(q1.filePath, 'utf8').trim();
	const parsed1 = JSON.parse(raw1);
	assert(parsed1.hmac, 'Persisted item should contain hmac');

	// Verify HMAC accepted
	const v1 = new Verifier({ allowLegacy: true });
	const res1 = v1.verifyHMAC(parsed1);
	assert(res1.valid, 'HMAC should verify in legacy mode');
	console.log('✓ Legacy HMAC enqueue & verify works');

	// Scenario 2: Switch to JWS mode
	const signer = new Signer();
	const verifierStrict = new Verifier({ allowLegacy: false });
	verifierStrict.addTrustedKey('swarmmind', km.loadPublicKey(), km.getPublicKeyInfo().key_id);
	Queue.setAttestation(signer, verifierStrict, km);

	const q2 = new Queue('JWS');
	if (fs.existsSync(q2.filePath)) fs.unlinkSync(q2.filePath);
	fs.writeFileSync(q2.filePath, '', { flag: 'wx' });

	const item2 = q2.enqueue({ target_lane: 'self', type: 'jws_test' });
	assert(item2.signature && !item2.hmac, 'JWS mode should not include HMAC');

	// Verify JWS
	const v2 = verifierStrict;
	const res2 = v2.verifyAgainstTrustStore(item2.signature, 'swarmmind');
	assert(res2.valid, 'JWS should verify in strict mode');
	console.log('✓ JWS mode works, HMAC not present');

	// Scenario 3: Strict mode rejecting HMAC
	const legacyItem = { id: 'Q-legacy', status: 'pending' };
	const secret = 'legacy-secret';
	const hmac = crypto.createHmac('sha256', secret).update(JSON.stringify(legacyItem)).digest('hex');
	legacyItem.hmac = hmac;
	const vStrict = new Verifier({ allowLegacy: false });
	const resStrict = vStrict.verifyHMAC(legacyItem);
	assert(!resStrict.valid, 'HMAC should be rejected when allowLegacy=false');
	console.log('✓ HMAC correctly rejected in strict mode');

	// Scenario 4: Migration window allows HMAC
	const vMigrate = new Verifier({ allowLegacy: true });
	const resMigrate = vMigrate.verifyHMAC(legacyItem);
	assert(resMigrate.valid, 'HMAC should be accepted when allowLegacy=true');
	console.log('✓ HMAC accepted during migration window');

	cleanup();
	console.log('\n✓ All migration tests passed');
	process.exit(0);
}

run().catch(e => {
	console.error('Test failed:', e);
	process.exit(1);
});
