/**
 * Test harness for File Permission Enforcement
 * Run with: node scripts/test-permissions.js
 */
const { FilePermissionEnforcer, PERMISSION_WHITELIST } = require('../src/permissions/FilePermissionEnforcer');
const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) {
    console.error('ASSERTION FAILED:', message);
    process.exit(1);
  }
}

// Set lane for test (simulate different lanes)
process.env.LANE_NAME = 'swarmmind';

// Test 1: SwarmMind can write to its own workspace
const swarmmindWritePath = 'S:/SwarmMind/test.txt';
assert(FilePermissionEnforcer.isAllowed('swarmmind', 'write', swarmmindWritePath), 
  'SwarmMind should be allowed to write to SwarmMind directory');

// Test 2: SwarmMind cannot write to arbitrary location
const arbitraryPath = 'C:/Windows/system32/config/system.ini';
assert(!FilePermissionEnforcer.isAllowed('swarmmind', 'write', arbitraryPath), 
  'SwarmMind should NOT be allowed to write to arbitrary system path');

// Test 3: Library can write to verification output
const libraryWritePath = 'S:/self-organizing-library/verification/results.md';
assert(FilePermissionEnforcer.isAllowed('library', 'write', libraryWritePath), 
  'Library should be allowed to write to verification output directory');

// Test 4: Archivist can write anywhere
assert(FilePermissionEnforcer.isAllowed('archivist', 'write', arbitraryPath), 
  'Archivist should be allowed to write anywhere');

// Test 5: Permission violation is thrown when attempting disallowed write
process.env.LANE_NAME = 'swarmmind';
const fsWrap = require('fs');
// Create a safe test file in allowed location
const testDir = 'S:/SwarmMind';
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
const safePath = path.join(testDir, 'safe_test.txt');

// This should succeed (write to allowed location)
try {
  fs.writeFileSync(safePath, 'test content');
  console.log('✓ Allowed write succeeded as expected');
} catch (e) {
  console.error('✗ Allowed write failed:', e.message);
  process.exit(1);
}

// Test 6: Attempt disallowed write (should throw)
const disallowedPath = 'C:/test_disallowed.txt';
let violationThrown = false;
try {
  fs.writeFileSync(disallowedPath, 'should fail');
} catch (e) {
  if (e.code === 'E_PERMISSION_DENIED') {
    violationThrown = true;
    console.log('✓ Disallowed write correctly blocked with E_PERMISSION_DENIED');
  } else {
    console.error('✗ Unexpected error type:', e.code, e.message);
    // Might be EACCES or ENOENT depending on system; check for our custom code
    if (e.message.includes('PERMISSION DENIED')) {
      violationThrown = true;
      console.log('✓ Disallowed write correctly blocked (message check)');
    } else {
      process.exit(1);
    }
  }
}
if (!violationThrown) {
  console.error('✗ Permission violation was not thrown for disallowed write');
  process.exit(1);
}

// Test 7: Verify whitelist structure
assert(PERMISSION_WHITELIST.archivist.write.includes('*'), 'Archivist should have wildcard write');
assert(PERMISSION_WHITELIST.swarmmind.write.some(p => p.includes('SwarmMind')), 'SwarmMind workspace should be whitelisted');

console.log('\nAll File Permission tests passed');
process.exit(0);
