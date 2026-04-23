#!/usr/bin/env node
/**
 * test-lane-consistency.js
 *
 * Phase 4.3 regression tests for lane consistency enforcement (A = B = C).
 * Tests that the verifier correctly rejects artifacts where payload.lane
 * differs from the outer lane argument.
 *
 * Required tests:
 * 1. MISSING_LANE - payload without lane field
 * 2. LANE_MISMATCH - payload.lane differs from outer lane
 * 3. Valid case - matching lanes verify correctly
 * 4. Legacy compatibility - origin_lane normalization
 */

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

process.env.SWARM_TEST_MODE = '1';

// Test setup
const TEST_DIR = path.join(__dirname, '..', '.test-lane-consistency');
const TRUST_STORE_PATH = path.join(TEST_DIR, 'keys.json');
const IDENTITY_DIR = path.join(TEST_DIR, 'identity');

function setup() {
	// Clean test directory
	if (fs.existsSync(TEST_DIR)) {
		fs.rmSync(TEST_DIR, { recursive: true });
	}
	fs.mkdirSync(TEST_DIR, { recursive: true });
	fs.mkdirSync(IDENTITY_DIR, { recursive: true });

	// Generate test keypair
	const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
		modulusLength: 2048,
		publicKeyEncoding: { type: 'spki', format: 'pem' },
		privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
	});

	// Write keys
	fs.writeFileSync(path.join(IDENTITY_DIR, 'public.pem'), publicKey);
	fs.writeFileSync(path.join(IDENTITY_DIR, 'private.pem'), privateKey);

	// Create trust store
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
			},
			library: {
				lane_id: 'library',
				authority: 60,
				public_key_pem: publicKey,
				algorithm: 'RS256',
				key_id: 'test-key-002',
				registered_at: new Date().toISOString(),
				revoked_at: null
			}
		},
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
	console.log('🧪 Lane Consistency Regression Tests\n');
	console.log('='.repeat(60));

	const { privateKey } = setup();

	// Load modules
	const { Verifier } = require('../src/attestation/Verifier.js');
	const { Signer } = require('../src/attestation/Signer.js');

	// Create instances with test trust store
	const verifier = new Verifier({ trustStorePath: TRUST_STORE_PATH });
	const signer = new Signer();

	let passed = 0;
	let failed = 0;

	// Test 1: MISSING_LANE
	console.log('\n📋 Test 1: MISSING_LANE - payload without lane field');
	try {
		const payloadNoLane = {
			id: 'test-001',
			data: 'test data',
			iat: Math.floor(Date.now() / 1000),
			exp: Math.floor((Date.now() + 86400000) / 1000)
		};

		const headerB64 = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-key-001' }))
			.toString('base64')
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');

		const payloadB64 = Buffer.from(JSON.stringify(payloadNoLane))
			.toString('base64')
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');

		const signingInput = `${headerB64}.${payloadB64}`;
		const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey);
		const signatureB64 = signature.toString('base64')
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');

		const jws = `${headerB64}.${payloadB64}.${signatureB64}`;

		const result = verifier.verifyAgainstTrustStore(jws, 'swarmmind');

		assert.strictEqual(result.valid, false, 'Expected valid=false');
		assert.strictEqual(result.error, 'MISSING_LANE', `Expected MISSING_LANE, got ${result.error}`);
		console.log('✅ PASS: Correctly rejected payload without lane field');
		passed++;
	} catch (e) {
		console.log('❌ FAIL:', e.message);
		failed++;
	}

	// Test 2: LANE_MISMATCH - identity mismatch test
	console.log('\n📋 Test 2: LANE_MISMATCH - payload.lane differs from outer lane');
	try {
		const payload = {
			lane: 'swarmmind',
			data: 'test data',
			timestamp: new Date().toISOString()
		};

		const signed = signer.sign(payload, privateKey, 'test-key-001');

		// Verify against wrong lane (library instead of swarmmind)
		const result = verifier.verifyAgainstTrustStore(signed.jws, 'library');

		assert.strictEqual(result.valid, false, 'Expected valid=false');
		assert.strictEqual(result.error, 'LANE_MISMATCH', `Expected LANE_MISMATCH, got ${result.error}`);
		assert.ok(result.note, 'Expected note field with details');
		assert.ok(result.note.includes('swarmmind'), 'Note should mention payload lane');
		assert.ok(result.note.includes('library'), 'Note should mention outer lane');
		console.log('✅ PASS: Correctly rejected lane mismatch');
		console.log(`   Note: ${result.note}`);
		passed++;
	} catch (e) {
		console.log('❌ FAIL:', e.message);
		failed++;
	}

	// Test 3: Valid case - matching lanes
	console.log('\n📋 Test 3: Valid case - payload.lane matches outer lane');
	try {
		const payload = {
			lane: 'swarmmind',
			data: 'test data',
			timestamp: new Date().toISOString()
		};

		const signed = signer.sign(payload, privateKey, 'test-key-001');
		const result = verifier.verifyAgainstTrustStore(signed.jws, 'swarmmind');

		assert.strictEqual(result.valid, true, `Expected valid=true, got error: ${result.error}`);
		assert.strictEqual(result.payload.lane, 'swarmmind', 'Payload should contain lane field');
		console.log('✅ PASS: Correctly verified matching lanes');
		passed++;
	} catch (e) {
		console.log('❌ FAIL:', e.message);
		failed++;
	}

	// Test 4: Legacy compatibility - origin_lane normalization
	console.log('\n📋 Test 4: Legacy compatibility - origin_lane normalization');
	try {
		const legacyItem = {
			id: 'test-legacy-001',
			timestamp: new Date().toISOString(),
			origin_lane: 'swarmmind',
			target_lane: 'library',
			type: 'TEST',
			status: 'pending'
		};

		// Sign with canonical lane field
		const signed = signer.signQueueItem(legacyItem, privateKey, 'test-key-001');

		// Verify that lane field was added
		assert.ok(signed.lane, 'Signed item should have lane field');
		assert.strictEqual(signed.lane, 'swarmmind', 'lane should match origin_lane');

		// Verify the signature
		const result = verifier.verifyQueueItem(signed);

		assert.strictEqual(result.valid, true, `Expected valid=true, got error: ${result.error}`);
		console.log('✅ PASS: Correctly normalized origin_lane to lane');
		passed++;
	} catch (e) {
		console.log('❌ FAIL:', e.message);
		failed++;
	}

	// Test 5: Schema version mismatch
	console.log('\n📋 Test 5: Schema version check');
	try {
		const badTrustStore = {
			version: '2.0',  // Wrong version
			keys: {},
			migration: {}
		};

		const badPath = path.join(TEST_DIR, 'bad-keys.json');
		fs.writeFileSync(badPath, JSON.stringify(badTrustStore, null, 2));

		let threw = false;
		try {
			new Verifier({ trustStorePath: badPath });
		} catch (e) {
			threw = true;
			assert.ok(e.message.includes('version'), 'Error should mention version mismatch');
		}

		assert.strictEqual(threw, true, 'Expected version mismatch error');
		console.log('✅ PASS: Correctly rejected wrong schema version');
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

// Run tests
runTests().catch(err => {
	console.error('Test runner failed:', err);
	process.exit(1);
});
