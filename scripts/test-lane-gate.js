#!/usr/bin/env node
/**
 * Phase 2: Lane-Context Gate Test
 * 
 * Tests cross-lane write enforcement:
 * 1. Same-lane write (SwarmMind lane) should succeed
 * 2. Cross-lane write (to Archivist-Agent) should be blocked and enter HOLD
 */

const fs = require('fs');
const path = require('path');
const { LaneContextGate } = require('../src/core/laneContextGate');

console.log('\n🧪 Lane-Context Gate Test Suite\n');
console.log('='.repeat(60));

// Helper to create a temporary test file path
function createTempPath(dir, name) {
  const timestamp = Date.now();
  return path.join(dir, `${name}-${timestamp}.tmp`);
}

async function runTests() {
  const projectRoot = process.cwd();
  // Governance root is the Archivist-Agent lane (authority 100)
  // Use direct S: path known from environment
  const governanceRoot = 'S:\\Archivist-Agent';

  // Initialize gate
  console.log('\n[TEST] Initializing LaneContextGate...');
  const gate = new LaneContextGate(projectRoot, { governanceRoot });
  
  const initOk = gate.initialize();
  if (!initOk) {
    console.error('[FAIL] Gate initialization failed');
    process.exit(1);
  }
  
  const status = gate.getStatus();
  console.log(`[INFO] Gate initialized:`);
  console.log(`  Lane: ${status.sessionLane}`);
  console.log(`  Authority: ${status.authority}`);
  console.log(`  Registry: ${status.registryLoaded ? 'loaded' : 'MISSING'}`);
  
  if (gate.isOnHold()) {
    console.error('[FAIL] Gate in HOLD state before tests');
    process.exit(1);
  }

  // TEST 1: Same-lane write (should succeed)
  console.log('\n' + '-'.repeat(60));
  console.log('[TEST 1] Same-lane write to SwarmMind directory');
  const testFile1 = createTempPath(projectRoot, 'lane-gate-test-same');
  
  try {
    const allowed = gate.preWriteGate(testFile1);
    if (!allowed) {
      console.error('[FAIL] Same-lane write was blocked (unexpected)');
      process.exit(1);
    }
    console.log('[PASS] Gate allowed same-lane write');
    
    // Actually perform write
    fs.writeFileSync(testFile1, 'test content - same lane');
    console.log(`[PASS] File written successfully: ${testFile1}`);
    fs.unlinkSync(testFile1);
    console.log('[PASS] Cleanup complete');
  } catch (err) {
    console.error('[FAIL] Same-lane write failed:', err.message);
    process.exit(1);
  }

  // TEST 2: Cross-lane write to Archivist-Agent (should be BLOCKED)
  console.log('\n' + '-'.repeat(60));
  console.log('[TEST 2] Cross-lane write to Archivist-Agent directory');
  const archivistTestFile = path.join(governanceRoot, `cross-lane-block-test-${Date.now()}.tmp`);
  
  let blocked = false;
  let holdEntered = false;
  
  try {
    const allowed = gate.preWriteGate(archivistTestFile);
    if (!allowed) {
      blocked = true;
      console.log('[PASS] Gate blocked cross-lane write');
    } else {
      console.error('[FAIL] Cross-lane write was allowed (security violation)');
      // Clean up if somehow written
      if (fs.existsSync(archivistTestFile)) {
        fs.unlinkSync(archivistTestFile);
      }
      process.exit(1);
    }
  } catch (err) {
    console.log('[PASS] Gate threw exception (expected):', err.message);
    blocked = true;
  }
  
  if (!blocked) {
    console.error('[FAIL] Cross-lane write was not blocked');
    process.exit(1);
  }
  
  // Check hold state
  if (gate.isOnHold()) {
    holdEntered = true;
    const hold = gate.getStatus().holdState;
    console.log('[PASS] System entered HOLD state');
    console.log(`  Reason: ${hold.reason}`);
    console.log(`  Timestamp: ${hold.timestamp}`);
  } else {
    console.error('[FAIL] Expected HOLD state after cross-lane block');
    process.exit(1);
  }
  
  // Verify no file was created
  if (fs.existsSync(archivistTestFile)) {
    console.error('[FAIL] Cross-lane file was created despite block');
    fs.unlinkSync(archivistTestFile);
    process.exit(1);
  } else {
    console.log('[PASS] No file created on cross-lane attempt');
  }

  // TEST 3: Operator resolution clears HOLD
  console.log('\n' + '-'.repeat(60));
  console.log('[TEST 3] Operator resolution clears HOLD');
  
  // Simulate operator providing confirmation for a legitimate reason
  // In real system, this would be explicit operator command
  gate.exitHold('operator-test-confirm');
  console.log('[PASS] HOLD state cleared by operator');
  
  if (gate.isOnHold()) {
    console.error('[FAIL] HOLD state still active after exitHold');
    process.exit(1);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ ALL TESTS PASSED');
  console.log('='.repeat(60));
  console.log('\nSummary:');
  console.log(' 1. Same-lane write: ALLOWED');
  console.log(' 2. Cross-lane write: BLOCKED + HOLD');
  console.log(' 3. Operator resolution: CLEARS HOLD');
  console.log('\nPhase 2 Lane-Context Gate: OPERATIONAL\n');
  
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
