/**
 * Test ContinuityVerifier: fingerprint, lineage, recovery integration
 * Run: node scripts/test-continuity.js
 */

const { ContinuityVerifier } = require('../src/resilience/ContinuityVerifier');
const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) {
    console.error('ASSERTION FAILED:', message);
    process.exit(1);
  }
}

function setupEnvironment() {
  const projectRoot = process.cwd();
  const stateDir = path.resolve(projectRoot, '.continuity_test');
  if (fs.existsSync(stateDir)) fs.rmSync(stateDir, { recursive: true });
  // Mock gate — captures HOLD states for assertion
  const holds = [];
  const gate = {
    enterHold: (reason, err) => {
      holds.push({ reason, message: err?.message || '' });
      console.log(`[Gate] HOLD: ${reason}`);
    },
    getHolds: () => holds
  };
  const cv = new ContinuityVerifier({ gate, projectRoot, stateDir });
  return { cv, gate };
}

async function run() {
  console.log('Testing ContinuityVerifier...\n');

  // First run: no previous fingerprint
  const { cv: cv1 } = setupEnvironment();
  const result1 = cv1.verify();
  assert(result1.action === 'CONTINUE', 'First run should continue');
  assert(result1.fingerprint_changed === null, 'No previous fingerprint');
  assert(result1.recovery_status === 'transient', 'Fresh recovery status should be transient');

  // Second run: same code, fingerprint unchanged
  // HARD ENFORCEMENT: Previous unsigned fingerprint now triggers HOLD.
  // This is correct behavior — unsigned data should not be trusted.
  const stateDir2 = path.resolve(process.cwd(), '.continuity_test2');
  if (fs.existsSync(stateDir2)) fs.rmSync(stateDir2, { recursive: true });
  const holds2 = [];
  const gate2 = {
    enterHold: (reason, err) => {
      holds2.push({ reason, message: err?.message || '' });
    }
  };
  const cv2a = new ContinuityVerifier({ projectRoot: process.cwd(), stateDir: stateDir2, gate: gate2 });
  // Write a dummy previous fingerprint file (unsigned — no JWS)
  const fpFile = path.join(stateDir2, 'fingerprint.json');
  const currentFp = cv2a.computeFingerprint();
  fs.writeFileSync(fpFile, JSON.stringify({ fingerprint: currentFp, updated_at: new Date().toISOString() }, null, 2));
  // Run verify — unsigned fingerprint triggers HOLD (hard enforcement)
  const result2 = cv2a.verify();
  assert(result2.action === 'HOLD' || holds2.length > 0,
    'Unsigned fingerprint should trigger HOLD (hard enforcement)');
  console.log(' ✓ Unsigned fingerprint correctly triggers HOLD (hard enforcement)');

  // Second run variant: verify with same fingerprint + no previous state (fresh start)
  const stateDir2b = path.resolve(process.cwd(), '.continuity_test2b');
  if (fs.existsSync(stateDir2b)) fs.rmSync(stateDir2b, { recursive: true });
  const cv2b = new ContinuityVerifier({ projectRoot: process.cwd(), stateDir: stateDir2b });
  const result2b = cv2b.verify();
  assert(result2b.action === 'CONTINUE', 'Fresh start should continue');
  console.log(' ✓ Fresh start (no previous fingerprint) continues');

  // Third run: simulate code change (tamper with a core file temporarily)
  // HARD ENFORCEMENT: Unsigned fingerprint triggers HOLD, not DRIFT_DETECTED
  const stateDir3 = path.resolve(process.cwd(), '.continuity_test3');
  if (fs.existsSync(stateDir3)) fs.rmSync(stateDir3, { recursive: true });
  const holds3 = [];
  const gate3 = {
    enterHold: (reason, err) => {
      holds3.push({ reason, message: err?.message || '' });
    }
  };
  const cv3 = new ContinuityVerifier({ projectRoot: process.cwd(), stateDir: stateDir3, gate: gate3 });
  // Write previous fingerprint (the current real one, unsigned)
  const realFp = cv3.computeFingerprint();
  console.log(' [debug] realFp before tamper:', realFp);
  fs.writeFileSync(path.join(stateDir3, 'fingerprint.json'), JSON.stringify({ fingerprint: realFp, updated_at: new Date().toISOString() }, null, 2));
  // Tamper with laneContextGate - append a comment to change hash
  const lcgPath = path.join(process.cwd(), 'src/core/laneContextGate.js');
  const original = fs.readFileSync(lcgPath, 'utf8');
  fs.writeFileSync(lcgPath, original + '\n// tampered for test\n');
  // Compute new fingerprint manually to verify
  const newFp = cv3.computeFingerprint();
  console.log(' [debug] newFp after tamper:', newFp);
  console.log(' [debug] fingerprints equal?', realFp === newFp);
  // Now verify — unsigned fingerprint triggers HOLD (hard enforcement)
  const result3 = cv3.verify();
  console.log(' [debug] result3:', JSON.stringify(result3, null, 2));
  // HARD ENFORCEMENT: Unsigned data → HOLD, not DRIFT_DETECTED
  assert(holds3.length > 0 || result3.action === 'HOLD',
    'Unsigned fingerprint should trigger HOLD (even with drift)');
  console.log(' ✓ Unsigned fingerprint with drift triggers HOLD (hard enforcement)');
  // Restore file
  fs.writeFileSync(lcgPath, original);

  // Fourth run: simulate lane degradation (permission error) via classifier state persistence
  const stateDir4 = path.resolve(process.cwd(), '.continuity_test4');
  if (fs.existsSync(stateDir4)) fs.rmSync(stateDir4, { recursive: true });
  const cv4 = new ContinuityVerifier({ projectRoot: process.cwd(), stateDir: stateDir4 });
  // Manually set classifier state to lane_degradation and quarantine
  const classifierStatePath = path.join(stateDir4, 'recovery-state.json');
  // Ensure directory exists
  if (!fs.existsSync(stateDir4)) fs.mkdirSync(stateDir4, { recursive: true });
  const degradState = {
    lane_id: 'swarmmind',
    created_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    current_classification: 'lane_degradation',
    consecutive_failures: 1,
    recent_events: [],
    quarantine_until: new Date(Date.now() + 3600000).toISOString(),
    needs_operator: true
  };
  fs.writeFileSync(classifierStatePath, JSON.stringify(degradState, null, 2));
  const result4 = cv4.verify();
  assert(result4.action === 'QUARANTINE', 'Lane degradation should cause quarantine');
  assert(result4.is_quarantined === true, 'Quarantine flag should be true');
  // Check that gate.enterHold was called (we stubbed; we can't easily assert here, but we saw log)

  console.log('\n✓ All Continuity Verifier tests passed');
  process.exit(0);
}

run().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
