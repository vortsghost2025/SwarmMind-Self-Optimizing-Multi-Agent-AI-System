/**
 * Test harness for seccomp-bpf simulator
 * Run with: node scripts/test-seccomp.js
 */
const { SeccompSimulator, seccomp } = require('../src/security/SeccompSimulator');

function assert(condition, message) {
  if (!condition) {
    console.error('ASSERTION FAILED:', message);
    process.exit(1);
  }
}

// Check simulator is active
assert(seccomp.enabled, 'Seccomp simulator should be enabled after load');

// Test allowed syscall
assert(seccomp.checkSyscall('read') === true, 'read should be allowed');
assert(seccomp.checkSyscall('write') === true, 'write should be allowed');

// Test blocked syscall (example: 'clone' is not in our whitelist)
assert(seccomp.checkSyscall('clone') === false, 'clone should be blocked');

// Verify log entries
const log = seccomp.getLog();
assert(log.length >= 1, 'Should have at least one log entry (filter_loaded)');
const filterLoaded = log.find(e => e.type === 'filter_loaded');
assert(filterLoaded, 'Should have filter_loaded event');

console.log('All seccomp-simulator tests passed');
process.exit(0);
