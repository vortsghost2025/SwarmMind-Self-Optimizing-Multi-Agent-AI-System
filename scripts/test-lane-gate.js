#!/usr/bin/env node
/**
 * Phase 2: Lane-Context Gate Test
 *
 * Tests cross-lane write enforcement:
 * 1. Same-lane write (SwarmMind lane) should succeed
 * 2. Cross-lane write (to governance root) should be blocked and enter HOLD
 * 3. Operator resolution clears HOLD
 * 4. Child process respects gate (Phase 2.5 NODE_OPTIONS enforcement)
 * 5. fs.promises respects gate (Phase 2.5 async coverage)
 */

if (!process.env.LANE_NAME) process.env.LANE_NAME = 'swarmmind';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { LaneContextGate, __reloadGate } = (() => {
  const gate = require('../src/core/laneContextGate');
  return { LaneContextGate: gate.LaneContextGate };
})();

console.log('\n[+] Lane-Context Gate Test Suite\n');
console.log('='.repeat(60));

function createTempPath(dir, name) {
  return path.join(dir, `${name}-${Date.now()}.tmp`);
}

async function runTests() {
  const projectRoot = process.cwd();
  const governanceRoot = 'S:\\Archivist-Agent';
  let gateGovernanceRoot;

  const archivistRegistryExists = (() => {
    try { return fs.existsSync(path.join(governanceRoot, 'FILE_OWNERSHIP_REGISTRY.json')); }
    catch (e) { return false; }
  })();

  if (!archivistRegistryExists) {
    const mockDir = path.join(projectRoot, '.test-mock-governance');
    if (!fs.existsSync(mockDir)) fs.mkdirSync(mockDir, { recursive: true });
    const mockRegistryPath = path.join(mockDir, 'FILE_OWNERSHIP_REGISTRY.json');
    const sessionLock = JSON.parse(fs.readFileSync(path.join(projectRoot, '.session-lock'), 'utf8'));
    const swarmmindPath = projectRoot.replace(/\\/g, '/');
    const archivistPath = governanceRoot.replace(/\\/g, '/');
    fs.writeFileSync(mockRegistryPath, JSON.stringify({
      default_ownership: "swarmmind",
      cross_lane_write_policy: { rule: "require_authority_100_or_same_lane" },
      ownership: {
        [swarmmindPath]: { lane_id: sessionLock.lane_id, authority: 80 },
        [archivistPath]: { lane_id: "archivist-agent", authority: 100 }
      }
    }, null, 2));

    const { PERMISSION_WHITELIST } = require('../src/permissions/FilePermissionEnforcer');
    const mockDirNorm = mockDir.replace(/\\/g, '/');
    PERMISSION_WHITELIST.swarmmind.read.push(mockDirNorm + '/**');
    PERMISSION_WHITELIST.swarmmind.write.push(mockDirNorm + '/**');

    console.log(`[INFO] Archivist governance root unavailable — using mock registry at ${mockRegistryPath}`);
    gateGovernanceRoot = mockDir;
  } else {
    gateGovernanceRoot = governanceRoot;
  }

  console.log('\n[TEST] Initializing LaneContextGate...');
  const gate = new LaneContextGate(projectRoot, { governanceRoot: gateGovernanceRoot });

  const initOk = gate.initialize();
  if (!initOk) {
    console.error('[FAIL] Gate initialization failed');
    process.exit(1);
  }

  gate.patchFs();

  const status = gate.getStatus();
  console.log(`[INFO] Gate initialized:`);
  console.log(`  Lane: ${status.sessionLane}`);
  console.log(`  Authority: ${status.authority}`);
  console.log(`  Registry: ${status.registryLoaded ? 'loaded' : 'MISSING'}`);

  if (gate.isOnHold()) {
    console.error('[FAIL] Gate in HOLD state before tests');
    process.exit(1);
  }

  // TEST 1: Same-lane write
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

    fs.writeFileSync(testFile1, 'test content - same lane');
    console.log(`[PASS] File written successfully: ${testFile1}`);
    fs.unlinkSync(testFile1);
    console.log('[PASS] Cleanup complete');
  } catch (err) {
    console.error('[FAIL] Same-lane write failed:', err.message);
    process.exit(1);
  }

  // TEST 2: Cross-lane write blocked
  console.log('\n' + '-'.repeat(60));
  console.log('[TEST 2] Cross-lane write to governance root directory');
  const archivistTestFile = path.join(gateGovernanceRoot, `cross-lane-block-test-${Date.now()}.tmp`);

  let blocked = false;

  try {
    const allowed = gate.preWriteGate(archivistTestFile);
    if (!allowed) {
      blocked = true;
      console.log('[PASS] Gate blocked cross-lane write');
    } else {
      console.error('[FAIL] Cross-lane write was allowed (security violation)');
      if (fs.existsSync(archivistTestFile)) fs.unlinkSync(archivistTestFile);
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

  if (gate.isOnHold()) {
    const hold = gate.getStatus().holdState;
    console.log('[PASS] System entered HOLD state');
    console.log(`  Reason: ${hold.reason}`);
  } else {
    console.error('[FAIL] Expected HOLD state after cross-lane block');
    process.exit(1);
  }

  if (fs.existsSync(archivistTestFile)) {
    console.error('[FAIL] Cross-lane file was created despite block');
    fs.unlinkSync(archivistTestFile);
    process.exit(1);
  }
  console.log('[PASS] No file created on cross-lane attempt');

  // TEST 3: Operator resolution
  console.log('\n' + '-'.repeat(60));
  console.log('[TEST 3] Operator resolution clears HOLD');

  gate.exitHold('operator-test-confirm');
  console.log('[PASS] HOLD state cleared by operator');

  if (gate.isOnHold()) {
    console.error('[FAIL] HOLD state still active after exitHold');
    process.exit(1);
  }

  // TEST 4: Child process NODE_OPTIONS
  console.log('\n' + '-'.repeat(60));
  console.log('[TEST 4] Child process respects LaneContextGate (NODE_OPTIONS enforcement)');

  const testTimestamp = Date.now();
  const childTargetPath = path.join(gateGovernanceRoot, `test-child-${testTimestamp}.tmp`).replace(/\\/g, '\\\\');
  const childCommand = `node -e "require('fs').writeFileSync('${childTargetPath}', 'child-process-test')"`;

  const gateModulePath = path.join(process.cwd(), 'src', 'core', 'laneContextGate.js');
  const childEnv = {
    ...process.env,
    LANE_NAME: 'swarmmind',
    NODE_OPTIONS: `--require ${gateModulePath}`
  };

  let childBlocked = false;

  try {
    execSync(childCommand, { env: childEnv, stdio: 'pipe', timeout: 5000 });
    childBlocked = false;
  } catch (execError) {
    childBlocked = true;
  }

  if (!childBlocked) {
    console.error('[FAIL] Child process was NOT blocked - gate bypass successful!');
    console.error('  CRITICAL: Child process wrote to Archivist-Agent without gate enforcement');
    process.exit(1);
  }

  console.log('[PASS] Child process cross-lane write blocked');

  const testChildPath = path.join(gateGovernanceRoot, `test-child-${testTimestamp}.tmp`);
  if (fs.existsSync(testChildPath)) {
    try { fs.unlinkSync(testChildPath); } catch(e) {}
    console.error('[FAIL] Child process file was created despite block');
    process.exit(1);
  }
  console.log('[PASS] No orphaned file created by child process');

  // TEST 5: fs.promises
  console.log('\n' + '-'.repeat(60));
  console.log('[TEST 5] fs.promises write respects LaneContextGate');

  const fsPromises = fs.promises;
  const testPromisePath = path.join(gateGovernanceRoot, `test-promises-${Date.now()}.tmp`);

  let promisesBlocked = false;

  try {
    await fsPromises.writeFile(testPromisePath, 'fs-promises-test');
    promisesBlocked = false;
  } catch (promiseError) {
    promisesBlocked = true;
    console.log('[PASS] fs.promises cross-lane write blocked');
  }

  if (!promisesBlocked) {
    try { if (fs.existsSync(testPromisePath)) fs.unlinkSync(testPromisePath); } catch(e) {}
    console.error('[FAIL] fs.promises write was NOT blocked - gate bypass!');
    process.exit(1);
  }

  if (fs.existsSync(testPromisePath)) {
    try { fs.unlinkSync(testPromisePath); } catch(e) {}
    console.error('[FAIL] fs.promises file created despite block');
    process.exit(1);
  }
  console.log('[PASS] No orphaned file from fs.promises attempt');

  // SUMMARY
  console.log('\n' + '='.repeat(60));
  console.log('[+] ALL PHASE 2.5 TESTS PASSED');
  console.log('='.repeat(60));
  console.log('\nSummary:');
  console.log('  1. Same-lane write: ALLOWED');
  console.log('  2. Cross-lane write: BLOCKED + HOLD');
  console.log('  3. Operator resolution: CLEARS HOLD');
  console.log('  4. Child process bypass: BLOCKED (NODE_OPTIONS enforced)');
  console.log('  5. fs.promises bypass: BLOCKED (async fs hooks installed)');
  console.log('\nPhase 2.5 Lane-Context Gate: CHILD_PROCESS + ASYNC_SECURE\n');

  process.exit(0);
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
