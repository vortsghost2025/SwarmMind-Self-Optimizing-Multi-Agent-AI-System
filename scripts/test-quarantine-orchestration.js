#!/usr/bin/env node
/**
 * test-quarantine-orchestration.js
 *
 * Phase 4.4 regression tests for quarantine orchestration layer.
 * Tests PhenotypeStore, QuarantineManager, and VerifierWrapper integration.
 */

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const TEST_DIR = path.join(__dirname, '..', '.test-quarantine');
const TRUST_STORE_PATH = path.join(TEST_DIR, 'keys.json');
const QUARANTINE_LOG_PATH = path.join(TEST_DIR, 'quarantine.log');
const HANDOFF_FILE = path.join(TEST_DIR, 'AGENT_HANDOFF_REQUIRED.md');

function setup() {
	if (fs.existsSync(TEST_DIR)) {
		fs.rmSync(TEST_DIR, { recursive: true });
	}
	fs.mkdirSync(TEST_DIR, { recursive: true });

	const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
		modulusLength: 2048,
		publicKeyEncoding: { type: 'spki', format: 'pem' },
		privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
	});

	const trustStore = {
		version: '1.0',
		updated_at: new Date().toISOString(),
		keys: {
			swarmmind: {
				lane_id: 'swarmmind',
				authority: 80,
				public_key_pem: publicKey,
				algorithm: 'RS256',
				key_id: 'test-key-001',
				registered_at: new Date().toISOString(),
				revoked_at: null
			}
		},
		phenotypes: {},
		migration: {
			hmac_cutoff: '2026-05-19T00:00:00Z',
			dual_mode_start: '2026-04-19T00:00:00Z',
			jws_only_start: '2026-05-19T00:00:00Z'
		}
	};

	fs.writeFileSync(TRUST_STORE_PATH, JSON.stringify(trustStore, null, 2));

	return { publicKey, privateKey };
}

function cleanup() {
	if (fs.existsSync(TEST_DIR)) {
		fs.rmSync(TEST_DIR, { recursive: true });
	}
}

async function runTests() {
	console.log('🧪 Quarantine Orchestration Tests\n');
	console.log('='.repeat(60));

	const { privateKey } = setup();

	const { Verifier } = require('../src/attestation/Verifier.js');
	const { Signer } = require('../src/attestation/Signer.js');
	const { PhenotypeStore } = require('../src/attestation/PhenotypeStore.js');
	const { QuarantineManager } = require('../src/attestation/QuarantineManager.js');
	const { VerifierWrapper } = require('../src/attestation/VerifierWrapper.js');

	const verifier = new Verifier({ trustStorePath: TRUST_STORE_PATH });
	const signer = new Signer();
	const wrapper = new VerifierWrapper({
		trustStorePath: TRUST_STORE_PATH,
		logPath: QUARANTINE_LOG_PATH,
		handoffFile: HANDOFF_FILE,
		maxRetries: 3,
		backoffMs: 100
	});

	let passed = 0;
	let failed = 0;

	// Test 1: PhenotypeStore basic operations
	console.log('\n📋 Test 1: PhenotypeStore - set and get');
	try {
		const phenotype = new PhenotypeStore({ trustStorePath: TRUST_STORE_PATH });
		const hash = phenotype.setLastSync('swarmmind', { lane: 'swarmmind', version: '1.0' });
		assert.ok(hash, 'Hash should be returned');
		assert.ok(hash.startsWith('sha256:'), 'Hash should be sha256 prefixed');

		const last = phenotype.getLastSync('swarmmind');
		assert.ok(last, 'Should retrieve last sync');
		assert.strictEqual(last.hash, hash, 'Hashes should match');

		console.log('✅ PASS: PhenotypeStore set/get works');
		passed++;
	} catch (e) {
		console.log('❌ FAIL:', e.message);
		failed++;
	}

	// Test 2: PhenotypeStore comparison
	console.log('\n📋 Test 2: PhenotypeStore - drift detection');
	try {
		const phenotype = new PhenotypeStore({ trustStorePath: TRUST_STORE_PATH });
		phenotype.setLastSync('swarmmind', { lane: 'swarmmind', version: '1.0' });

		const match = phenotype.compareWithLast('swarmmind', { lane: 'swarmmind', version: '1.0' });
		assert.strictEqual(match.match, true, 'Should match identical state');

		const drift = phenotype.compareWithLast('swarmmind', { lane: 'swarmmind', version: '2.0' });
		assert.strictEqual(drift.match, false, 'Should detect drift');
		assert.ok(drift.last_hash !== drift.current_hash, 'Hashes should differ');

		console.log('✅ PASS: PhenotypeStore drift detection works');
		passed++;
	} catch (e) {
		console.log('❌ FAIL:', e.message);
		failed++;
	}

	// Test 3: QuarantineManager basic quarantine
	console.log('\n📋 Test 3: QuarantineManager - basic quarantine');
	try {
		const qm = new QuarantineManager({
			logPath: QUARANTINE_LOG_PATH,
			handoffFile: HANDOFF_FILE,
			maxRetries: 3
		});

		const item = { id: 'test-001', lane: 'swarmmind', data: 'test' };
		const result = qm.quarantine(item, 'SIGNATURE_MISMATCH');

		assert.strictEqual(result.status, 'QUARANTINED', 'Should be quarantined');
		assert.strictEqual(result.retryCount, 1, 'First retry');
		assert.ok(qm.isQuarantined('test-001'), 'Item should be in quarantine');

		console.log('✅ PASS: QuarantineManager basic quarantine works');
		passed++;
	} catch (e) {
		console.log('❌ FAIL:', e.message);
		failed++;
	}

	// Test 4: QuarantineManager max retries
	console.log('\n📋 Test 4: QuarantineManager - max retries exceeded');
	try {
		const qm = new QuarantineManager({
			logPath: QUARANTINE_LOG_PATH,
			handoffFile: HANDOFF_FILE,
			maxRetries: 3
		});

		const item = { id: 'test-002', lane: 'swarmmind', data: 'test' };

		// Quarantine 3 times
		qm.quarantine(item, 'REASON_1');
		qm.quarantine(item, 'REASON_2');
		const result = qm.quarantine(item, 'REASON_3');

		assert.strictEqual(result.status, 'MAX_RETRIES_EXCEEDED', 'Should exceed max');
		assert.strictEqual(result.handoffRequired, true, 'Should require handoff');
		assert.ok(fs.existsSync(HANDOFF_FILE), 'Handoff file should be created');

		const handoffContent = fs.readFileSync(HANDOFF_FILE, 'utf8');
		assert.ok(handoffContent.includes('AGENT HANDOFF REQUIRED'), 'Should contain header');
		assert.ok(handoffContent.includes('test-002'), 'Should contain item ID');

		qm.clearHandoffSignal();

		console.log('✅ PASS: QuarantineManager max retries triggers handoff');
		passed++;
	} catch (e) {
		console.log('❌ FAIL:', e.message);
		failed++;
	}

	// Test 5: QuarantineManager release
	console.log('\n📋 Test 5: QuarantineManager - release from quarantine');
	try {
		const qm = new QuarantineManager({
			logPath: QUARANTINE_LOG_PATH,
			handoffFile: HANDOFF_FILE,
			maxRetries: 3
		});

		const item = { id: 'test-003', lane: 'swarmmind', data: 'test' };
		qm.quarantine(item, 'TEST_REASON');

		const release = qm.release('test-003');
		assert.strictEqual(release.success, true, 'Should release successfully');
		assert.strictEqual(release.reason, 'QUARANTINE_RELEASED', 'Should have correct reason');
		assert.ok(!qm.isQuarantined('test-003'), 'Should not be quarantined');

		console.log('✅ PASS: QuarantineManager release works');
		passed++;
	} catch (e) {
		console.log('❌ FAIL:', e.message);
		failed++;
	}

	// Test 6: VerifierWrapper - valid item passes through
	console.log('\n📋 Test 6: VerifierWrapper - valid item verification');
	try {
		// Create queue item with proper structure
		// The JWS contains the signed payload (which includes 'lane')
		// The outer item has 'lane' and 'origin_lane' matching the signed payload
		const queueItem = {
			id: 'test-004',
			timestamp: new Date().toISOString(),
			lane: 'swarmmind',
			origin_lane: 'swarmmind',
			target_lane: 'library',
			type: 'TEST',
			payload: { data: 'test data' }
		};

		// Sign the item (Signer adds canonical 'lane' field)
		const signed = signer.signQueueItem(queueItem, privateKey, 'test-key-001');

		// Verify the signed item
		const result = await wrapper.verify(signed);
		assert.strictEqual(result.valid, true, `Should be valid, got: ${result.reason || result.error}`);
		assert.strictEqual(result.mode, 'JWS_VERIFIED', 'Should be JWS verified');

		console.log('✅ PASS: VerifierWrapper verifies valid items');
		passed++;
	} catch (e) {
		console.log('❌ FAIL:', e.message);
		failed++;
	}

	// Test 7: VerifierWrapper - lane mismatch triggers quarantine
	console.log('\n📋 Test 7: VerifierWrapper - lane mismatch quarantine');
	try {
		// Create item where outer lane differs from signed lane
		const queueItem = {
			id: 'test-005',
			timestamp: new Date().toISOString(),
			lane: 'swarmmind',
			origin_lane: 'swarmmind',
			target_lane: 'library',
			type: 'TEST',
			payload: { data: 'test data' }
		};

		// Sign with swarmmind lane
		const signed = signer.signQueueItem(queueItem, privateKey, 'test-key-001');

		// Tamper with outer lane to create mismatch
		signed.lane = 'library';  // MISMATCH with signed payload
		signed.origin_lane = 'library';

		const result = await wrapper.verify(signed);
		assert.strictEqual(result.valid, false, 'Should be invalid');
		assert.strictEqual(result.reason, 'QUARANTINED', `Should be quarantined, got: ${result.reason}`);
		assert.ok(result.retryCount >= 1, 'Should have retry count');

		console.log('✅ PASS: VerifierWrapper quarantines lane mismatch');
		passed++;
	} catch (e) {
		console.log('❌ FAIL:', e.message);
		failed++;
	}

	// Test 8: VerifierWrapper - metrics collection
	console.log('\n📋 Test 8: VerifierWrapper - metrics collection');
	try {
		const metrics = wrapper.getMetrics();
		assert.ok(metrics.quarantine, 'Should have quarantine metrics');
		assert.ok(metrics.phenotypes, 'Should have phenotype metrics');
		assert.ok(metrics.quarantine.total >= 1, 'Should have quarantined items');

		console.log('✅ PASS: VerifierWrapper metrics work');
		console.log(`   Total quarantined: ${metrics.quarantine.total}`);
		passed++;
	} catch (e) {
		console.log('❌ FAIL:', e.message);
		failed++;
	}

	// Summary
	console.log('\n' + '='.repeat(60));
	console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

	cleanup();

	process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
	console.error('Test runner failed:', err);
	process.exit(1);
});
