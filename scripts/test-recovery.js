/**
 * Comprehensive tests for Recovery Classifier
 * Run: node scripts/test-recovery.js
 */

const { RecoveryClassifier } = require('../src/resilience/RecoveryClassifier');
const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) {
    console.error('ASSERTION FAILED:', message);
    process.exit(1);
  }
}

function setupCleanState(laneId = 'testlane') {
  const stateDir = path.resolve(__dirname, '../state/test_classifier');
  if (fs.existsSync(stateDir)) fs.rmSync(stateDir, { recursive: true });
  return new RecoveryClassifier({ laneId, stateDir });
}

async function runTests() {
  console.log('Testing Recovery Classifier...\n');

  // Test 1: Transient → no classification change (reset counter)
  const rc1 = setupCleanState('test1');
  rc1.recordSuccess();
  const s1 = rc1.getStatus();
  assert(s1.current_classification === 'transient', 'Fresh state should be transient');
  assert(s1.consecutive_failures === 0, 'Success resets counter');

  // Test 2: Lane degradation (permission denied) → triggers quarantine after first
  const rc2 = setupCleanState('test2');
  const outcome2 = {
    operation: 'fs_write',
    target: 'S:/Archivist-Agent/test.txt',
    finalError: { code: 'E_PERMISSION_DENIED', message: 'PERMISSION DENIED' },
    attempts: 1
  };
  const res2 = rc2.classify(outcome2);
  assert(res2.classification === 'lane_degradation', 'Permission denied should classify as lane_degradation');
  assert(res2.requiresOperator === true, 'Lane degradation requires operator');
  assert(rc2.isQuarantined(), 'Lane degradation should trigger quarantine');
  const s2 = rc2.getStatus();
  assert(s2.consecutive_failures === 1, 'Failure should increment counter');

  // Test 3: Persistent dependency (timeout) with low attempts → not quarantine
  const rc3 = setupCleanState('test3');
  const outcome3 = {
    operation: 'http_get',
    target: 'https://unreachable',
    finalError: { code: 'ETIMEDOUT', message: 'Operation timeout' },
    attempts: 2
  };
  const res3 = rc3.classify(outcome3);
  assert(res3.classification === 'persistent_dependency', 'Timeout should be persistent_dependency');
  assert(!rc3.isQuarantined(), 'Persistent dependency with low attempts should not quarantine');
  assert(!res3.requiresOperator, 'Should not require operator yet');

  // Test 4: Repeated failures → recovery_required
  const rc4 = setupCleanState('test4');
  // Simulate 3 consecutive failures
  for (let i = 0; i < 3; i++) {
    rc4.classify({
      operation: 'generic',
      target: 'somewhere',
      finalError: { code: 'ECONNRESET', message: 'Connection reset' },
      attempts: 1
    });
  }
  const s4 = rc4.getStatus();
  assert(s4.current_classification === 'recovery_required', '3 consecutive failures should require recovery');
  assert(s4.needs_operator === true, 'Recovery required needs operator');
  assert(s4.consecutive_failures === 3, 'Counter should be 3');

  // Test 5: Persistent dependency with many attempts → quarantine
  const rc5 = setupCleanState('test5');
  // Simulate 5 failures (simulate by directly calling classify with attempts=5)
  rc5.classify({
    operation: 'queue_enqueue',
    target: 'queue',
    finalError: { code: 'ECONNREFUSED', message: 'Connection refused' },
    attempts: 5
  });
  assert(rc5.isQuarantined(), '5 attempts on persistent dependency should quarantine');
  const s5 = rc5.getStatus();
  assert(s5.quarantine_until !== null, 'Quarantine timestamp set');

  // Test 6: Success after some failures resets counter
  const rc6 = setupCleanState('test6');
  rc6.classify({ operation: 'x', target: 'y', finalError: new Error('fail'), attempts: 1 });
  rc6.recordSuccess();
  const s6 = rc6.getStatus();
  assert(s6.consecutive_failures === 0, 'Success should reset consecutive failures');
  assert(s6.current_classification === 'transient', 'Back to transient after success');

  // Test 7: Clear quarantine
  const rc7 = setupCleanState('test7');
  rc7.state.quarantine_until = new Date(Date.now() + 3600000).toISOString();
  rc7.state.needs_operator = true;
  rc7.clearQuarantine();
  const s7 = rc7.getStatus();
  assert(s7.quarantine_until === null, 'Quarantine cleared');
  assert(!s7.needs_operator, 'Operator flag cleared');
  assert(s7.consecutive_failures === 0, 'Failure counter reset on clear');

  // Test 8: State persistence
  const rc8 = setupCleanState('test8');
  rc8.classify({ operation: 'op', target: 't', finalError: new Error('err'), attempts: 3 });
  const saved = JSON.parse(fs.readFileSync(rc8.stateFile, 'utf8'));
  assert(saved.consecutive_failures === 1, 'Persistence saved consecutive failures');

  console.log('\n✓ All Recovery Classifier tests passed');
  process.exit(0);
}

runTests().catch(e => {
  console.error('Test suite failed:', e);
  process.exit(1);
});
