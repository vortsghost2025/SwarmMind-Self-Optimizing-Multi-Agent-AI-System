#!/usr/bin/env node
/**
 * Lane Continuity Verification Script (Phase 3.6–3.7)
 *
 * Runs all continuity-related test suites:
 *  - Recovery Classifier unit tests
 *  - Retry+Recovery integration
 *  - Continuity Verifier tests
 *
 * Exits 0 on success, 1 on any failure.
 *
 * Library will invoke this to attest SwarmMind's continuity health.
 */

const { execSync } = require('child_process');

const TESTS = [
  'scripts/test-recovery.js',
  'scripts/test-recovery-integration.js',
  'scripts/test-continuity.js'
];

console.log('\n🔬 Continuity Verification Suite — SwarmMind (Lane 2)\n');
console.log('='.repeat(60));

for (const test of TESTS) {
  console.log(`\n▶ Running: ${test}`);
  try {
    execSync(`node ${test}`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`\n❌ Verification failed in ${test}`);
    process.exit(1);
  }
}

console.log('\n' + '='.repeat(60));
console.log('✅ All continuity verification checks passed\n');
process.exit(0);
