/**
 * Test harness for Retry Wrapper
 * Run with: node scripts/test-retry.js
 */
const { RetryWrapper } = require('../src/resilience/RetryWrapper');
const fs = require('fs');

function assert(condition, message) {
  if (!condition) {
    console.error('ASSERTION FAILED:', message);
    process.exit(1);
  }
}

async function runTests() {
  console.log('Testing Retry Wrapper...\n');

  // Test 1: Success on first attempt
  const retry1 = new RetryWrapper({ maxAttempts: 3, timeoutMs: 100, audit: false });
  let callCount = 0;
  const result1 = await retry1.execute(
    async () => { callCount++; return 'first'; },
    { operation: 'test_immediate_success' }
  );
  assert(result1 === 'first', 'Should return first attempt result');
  assert(callCount === 1, 'Should have called function only once');

  // Test 2: Success after retries
  const retry2 = new RetryWrapper({ maxAttempts: 3, initialDelayMs: 10, timeoutMs: 100, audit: false });
  let attempts = 0;
  const failingFn = async () => {
    attempts++;
    if (attempts < 3) throw new Error('fail');
    return 'success';
  };
  const result2 = await retry2.execute(failingFn, { operation: 'test_retry_then_success' });
  assert(result2 === 'success', 'Should eventually succeed');
  assert(attempts === 3, 'Should have attempted 3 times');

  // Test 3: Permanent failure exhausts retries
  const retry3 = new RetryWrapper({ maxAttempts: 2, initialDelayMs: 10, timeoutMs: 100, audit: false });
  let attempts3 = 0;
  const alwaysFails = async () => { attempts3++; throw new Error('permanent fail'); };
  let failed = false;
  try {
    await retry3.execute(alwaysFails, { operation: 'test_permanent_failure' });
  } catch (e) {
    failed = true;
    assert(e.message === 'permanent fail', 'Should propagate final error');
  }
  assert(failed, 'Should have thrown after exhausting retries');
  assert(attempts3 === 2, 'Should have attempted exactly maxAttempts times');

  // Test 4: Timeout triggers retry
  const retry4 = new RetryWrapper({ maxAttempts: 2, initialDelayMs: 10, timeoutMs: 50, audit: false });
  let attempts4 = 0;
  const slowFn = async () => {
    attempts4++;
    await new Promise(resolve => setTimeout(resolve, 100)); // exceeds timeout
    return 'too late';
  };
  try {
    await retry4.execute(slowFn, { operation: 'test_timeout_retry' });
  } catch (e) {
    assert(e.code === 'ETIMEDOUT', 'Should be a timeout error');
    assert(attempts4 === 2, 'Should have retried after timeout');
  }

  // Test 5: Custom retry predicate
  const retry5 = new RetryWrapper({
    maxAttempts: 3,
    initialDelayMs: 10,
    timeoutMs: 100,
    audit: false,
    shouldRetry: (err) => err.message === 'retryable'  // exact match
  });
  let attempts5 = 0;
  const conditionalFn = async () => {
    attempts5++;
    if (attempts5 === 1) throw new Error('retryable');
    if (attempts5 === 2) throw new Error('non-retryable');
    return 'ok';
  };
  let caught = false;
  try {
    await retry5.execute(conditionalFn, { operation: 'test_custom_predicate' });
  } catch (e) {
    caught = true;
    assert(e.message === 'non-retryable', 'Should stop on non-retryable error');
  }
  assert(caught, 'Should have thrown on non-retryable');
  assert(attempts5 === 2, 'Should have attempted twice (1 retry + 1 final)');

  // Test 6: Deterministic backoff curve (no jitter)
  const retry6 = new RetryWrapper({
    maxAttempts: 4,
    initialDelayMs: 50,
    timeoutMs: 100,
    enableJitter: false,
    audit: false
  });
  const delays = [];
  retry6.onRetry = (attempt, err, delayMs) => { delays.push(delayMs); };
  let attempts6 = 0;
  const failingAgain = async () => { attempts6++; throw new Error('fail'); };
  try {
    await retry6.execute(failingAgain, { operation: 'test_backoff_curve' });
  } catch (e) {
    // Expected to exhaust
  }
  assert(attempts6 === 4, 'Should have 4 attempts');
  assert(delays.length === 3, 'Should have 3 retry backoffs');
  assert(delays[0] === 50, 'First deterministic delay should be 50ms');
  assert(delays[1] === 100, 'Second deterministic delay should be 100ms');
  assert(delays[2] === 200, 'Third deterministic delay should be 200ms');

  // Test 7: Jitter mode stays in expected bounds
  const retry7 = new RetryWrapper({
    maxAttempts: 4,
    initialDelayMs: 80,
    timeoutMs: 100,
    enableJitter: true,
    audit: false
  });
  const jitterDelays = [];
  retry7.onRetry = (attempt, err, delayMs) => { jitterDelays.push(delayMs); };
  let attempts7 = 0;
  const failWithJitter = async () => { attempts7++; throw new Error('fail'); };
  try {
    await retry7.execute(failWithJitter, { operation: 'test_jitter_bounds' });
  } catch (e) {
    // Expected to exhaust
  }
  assert(attempts7 === 4, 'Jitter path should also execute 4 attempts');
  assert(jitterDelays.length === 3, 'Jitter path should have 3 retry backoffs');
  const expectedBases = [80, 160, 320];
  for (let i = 0; i < jitterDelays.length; i++) {
    const min = Math.floor(expectedBases[i] * 0.75);
    const max = Math.ceil(expectedBases[i] * 1.25);
    assert(
      jitterDelays[i] >= min && jitterDelays[i] <= max,
      `Jitter delay ${i + 1} should be within [${min}, ${max}]ms; got ${jitterDelays[i]}`
    );
  }

  console.log('\n✓ All Retry Wrapper tests passed');
  process.exit(0);
}

runTests().catch(e => {
  console.error('Test suite failed:', e);
  process.exit(1);
});
