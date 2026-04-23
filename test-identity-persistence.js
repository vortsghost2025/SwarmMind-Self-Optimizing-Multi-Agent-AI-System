/**
 * Test: Identity Persistence
 * 
 * Verifies that identity keys persist across process restarts.
 * 
 * Run: node test-identity-persistence.js
 */

const { IdentityManager } = require('./src/attestation/IdentityAttestation.js');
const fs = require('fs');
const path = require('path');

const TEST_IDENTITY_PATH = path.join(__dirname, '.test-identity', 'keys.json');

console.log('=== Identity Persistence Test ===\n');

// Clean up any existing test identity
const testDir = path.dirname(TEST_IDENTITY_PATH);
if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
}

// Test 1: First instantiation creates key
console.log('Test 1: First instantiation creates key');
const identity1 = new IdentityManager({ identityPath: TEST_IDENTITY_PATH });
const key1 = identity1.laneKey;
const info1 = identity1.getIdentityInfo();
console.log(`  Lane: ${info1.laneId}`);
console.log(`  Key created at: ${info1.keyCreatedAt}`);
console.log(`  Key path: ${info1.identityPath}`);
console.log(`  Key present: ${info1.keyPresent}`);
console.log(`  Key (first 16 chars): ${key1.substring(0, 16)}...\n`);

// Verify file exists
if (fs.existsSync(TEST_IDENTITY_PATH)) {
    console.log('  ✓ Key file created');
} else {
    console.log('  ✗ Key file NOT created');
    process.exit(1);
}

// Test 2: Second instantiation uses same key
console.log('\nTest 2: Second instantiation uses same key');
const identity2 = new IdentityManager({ identityPath: TEST_IDENTITY_PATH });
const key2 = identity2.laneKey;
const info2 = identity2.getIdentityInfo();

console.log(`  Key (first 16 chars): ${key2.substring(0, 16)}...`);
console.log(`  Same key? ${key1 === key2 ? 'YES' : 'NO'}`);

if (key1 === key2) {
    console.log('  ✓ Key persisted across instantiation');
} else {
    console.log('  ✗ Key changed (persistence failed)');
    process.exit(1);
}

// Test 3: Signature verification
console.log('\nTest 3: Signature verification');
const testItem = {
    id: 'test-001',
    timestamp: new Date().toISOString(),
    origin_lane: 'test',
    type: 'TEST',
    artifact_path: '/test/path',
    required_action: 'verify',
    payload: { test: true }
};

const signature = identity1.sign(testItem);
const verified = identity2.verify(testItem, signature);

console.log(`  Signature: ${signature.substring(0, 16)}...`);
console.log(`  Verified: ${verified ? 'YES' : 'NO'}`);

if (verified) {
    console.log('  ✓ Signature verification works');
} else {
    console.log('  ✗ Signature verification failed');
    process.exit(1);
}

// Test 4: File contents are valid JSON
console.log('\nTest 4: Key file contents');
const keyData = JSON.parse(fs.readFileSync(TEST_IDENTITY_PATH, 'utf8'));
console.log(`  File contents:`);
console.log(`    laneId: ${keyData.laneId}`);
console.log(`    algorithm: ${keyData.algorithm}`);
console.log(`    createdAt: ${keyData.createdAt}`);
console.log(`    signingKey: ${keyData.signingKey.substring(0, 16)}...`);

if (keyData.signingKey && keyData.createdAt) {
    console.log('  ✓ Key file has valid structure');
} else {
    console.log('  ✗ Key file missing required fields');
    process.exit(1);
}

// Cleanup
console.log('\n=== All tests passed ===');
console.log(`Test identity files at: ${testDir}`);
console.log('(You can delete this directory)');
