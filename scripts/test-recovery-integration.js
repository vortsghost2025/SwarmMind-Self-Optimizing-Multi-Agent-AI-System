/**
 * Integration test: Retry Wrapper + Recovery Classifier
 * Demonstrates wiring retry exhaustion into continuity registry.
 *
 * Run: node scripts/test-recovery-integration.js
 */

const { RetryWrapper } = require('../src/resilience/RetryWrapper');
const { RecoveryClassifier } = require('../src/resilience/RecoveryClassifier');
const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) {
    console.error('ASSERTION FAILED:', message);
    process.exit(1);
  }
}

async function run() {
  console.log('Running Recovery Integration Test...\n');

  // Prepare a fresh recovery state
  const stateDir = path.resolve(__dirname, '../state/test_recovery');
  if (fs.existsSync(stateDir)) {
    fs.rmSync(stateDir, { recursive: true });
  }
  const classifier = new RecoveryClassifier({ laneId: 'swarmmind', stateDir });

  // Create retry wrapper with short timeout, max 2 attempts, and classifier wired
  const retry = new RetryWrapper({
    maxAttempts: 2,
    initialDelayMs: 10,
    timeoutMs: 50,
    audit: false,
    recoveryClassifier: classifier
  });

  // Simulate an operation that always times out (transient network)
  let attemptCount = 0;
  const slowFn = async () => {
    attemptCount++;
    await new Promise(resolve => setTimeout(resolve, 100)); // exceeds timeout
    return 'ok';
  };

  try {
    await retry.execute(slowFn, { operation: 'sim_http', target: 'http://test' });
  } catch (e) {
    // Expected exhaustion
    assert(e.code === 'ETIMEDOUT', 'Should be timeout error');
  }

  // Verify retry count
  assert(attemptCount === 2, `Should have 2 attempts (maxAttempts), got ${attemptCount}`);

  // Check recovery state
  const status = classifier.getStatus();
  console.log('Recovery status after exhaustion:', status);

  assert(status.consecutive_failures >= 1, 'Should have recorded consecutive failure');
  // Classification for timeout after retries should be persistent_dependency (external)
  assert(status.current_classification === 'persistent_dependency',
    `Expected persistent_dependency, got ${status.current_classification}`);

  // Save and reload state to verify persistence
  const saved = JSON.parse(fs.readFileSync(classifier.stateFile, 'utf8'));
  assert(saved.current_classification === 'persistent_dependency', 'State persisted correctly');

  // Verify INCIDENT queue was emitted (quarantine not triggered for 2 attempts, but event logged)
  // For this test, quarantine_until should be null
  assert(status.quarantine_until === null, 'Quarantine should not trigger with only 2 attempts');

  console.log('\n✓ Recovery integration test passed');
  process.exit(0);
}

run().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
