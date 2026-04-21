/**
 * Test continuity state signing and verification
 * Run: node scripts/test-continuity-signatures.js
 */

const { KeyManager } = require('../src/attestation/KeyManager');
const { Signer } = require('../src/attestation/Signer');
const { Verifier } = require('../src/attestation/Verifier');
const { ContinuityVerifier } = require('../src/resilience/ContinuityVerifier');
const fs = require('fs');
const path = require('path');

function assert(condition, message) {
	if (!condition) {
		console.error('ASSERTION FAILED:', message);
		process.exit(1);
	}
}

function cleanup() {
	const contDir = path.join(process.cwd(), '.continuity');
	if (fs.existsSync(contDir)) fs.rmSync(contDir, { recursive: true, force: true });
	const idDir = path.join(process.cwd(), '.identity');
	if (fs.existsSync(idDir)) fs.rmSync(idDir, { recursive: true, force: true });
}

async function run() {
	console.log('Testing Continuity Attestation...\n');
	cleanup();

	process.env.LANE_NAME = 'swarmmind';
	process.env.LANE_KEY_PASSPHRASE = 'test-passphrase-continuity';

	// Setup keys, signer, verifier
	const km = new KeyManager({ laneId: 'swarmmind' });
	km.initialize(process.env.LANE_KEY_PASSPHRASE);
	const signer = new Signer();
	const verifier = new Verifier();
	verifier.addTrustedKey('swarmmind', km.loadPublicKey(), km.getPublicKeyInfo().key_id);

	// Create a dummy ContinuityVerifier (no gate needed for test)
	const cv = new ContinuityVerifier({
		gate: null,
		projectRoot: process.cwd(),
		stateDir: path.join(process.cwd(), '.continuity'),
		signer: signer,
		verifier: verifier,
		keyManager: km
	});

	// Simulate a full verify cycle: compute fingerprint, create lineage, save
	const currentFp = cv.computeFingerprint();
	// Dummy lineage (as would be built)
	const lineage = {
		last_session: null,
		current_session: {
			started_at: new Date().toISOString(),
			fingerprint: currentFp,
			recovery_classification: 'transient'
		},
		drift_history: []
	};

	// Save with signing
	cv._saveCurrentData(currentFp, lineage, { current_classification: 'transient' });

	// Check that files exist and contain signature
	const fpPath = path.join(process.cwd(), '.continuity', 'fingerprint.json');
	const lnPath = path.join(process.cwd(), '.continuity', 'lineage.json');
	assert(fs.existsSync(fpPath), 'fingerprint.json should exist');
	assert(fs.existsSync(lnPath), 'lineage.json should exist');

	const fpRaw = JSON.parse(fs.readFileSync(fpPath, 'utf8'));
	const lnRaw = JSON.parse(fs.readFileSync(lnPath, 'utf8'));

	assert(fpRaw.signature, 'Fingerprint should be signed');
	assert(lnRaw.signature, 'Lineage should be signed');

	// Verify signature using verifier (trust includes our key)
	const fpVerify = verifier.verifyAgainstTrustStore(fpRaw.signature, 'swarmmind');
	assert(fpVerify.valid, 'Fingerprint signature valid');
	const lnVerify = verifier.verifyAgainstTrustStore(lnRaw.signature, 'swarmmind');
	assert(lnVerify.valid, 'Lineage signature valid');

	console.log('✓ Continuity files signed and verifiable');

	// Test that corrupted signature fails: modify file, keep signature but change payload
	fpRaw.fingerprint = 'tampered';
	fs.writeFileSync(fpPath, JSON.stringify(fpRaw, null, 2));
	// Load via _loadStoredData; should detect invalid signature and return null prevFp
	const reloaded = cv._loadStoredData();
	assert(reloaded.prevFp === null, 'Tampered fingerprint should be rejected on load');
	console.log('✓ Tampered continuity state detected on load');

	cleanup();
	console.log('\n✓ All continuity attestation tests passed');
	process.exit(0);
}

run().catch(e => {
	console.error('Test failed:', e);
	process.exit(1);
});
