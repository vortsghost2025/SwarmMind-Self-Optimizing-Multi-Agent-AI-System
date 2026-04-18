#!/usr/bin/env node
/**
 * Phase 2 Implementation Verification
 * Validates all changes are in place before commit
 */

const fs = require('fs');
const path = require('path');

console.log('\n🔍 Phase 2 Implementation Verification\n');
console.log('='.repeat(60));

const projectRoot = 'S:\\SwarmMind Self-Optimizing Multi-Agent AI System';
const governanceRoot = 'S:\\Archivist-Agent';

let errors = 0;
let checks = 0;

function check(description, condition) {
  checks++;
  if (condition) {
    console.log(`✅ ${description}`);
  } else {
    console.log(`❌ ${description}`);
    errors++;
  }
}

// 1. Verify new files exist
console.log('\n[1] New Files Created:');
check('src/core/laneContextGate.js exists', fs.existsSync(path.join(projectRoot, 'src/core/laneContextGate.js')));
check('scripts/test-lane-gate.js exists', fs.existsSync(path.join(projectRoot, 'scripts/test-lane-gate.js')));

// 2. Verify modified files have gate integration
console.log('\n[2] Integration Points:');

const governedStartContent = fs.readFileSync(path.join(projectRoot, 'scripts/governed-start.js'), 'utf8');
check('governed-start.js imports LaneContextGate', governedStartContent.includes("require('../src/core/laneContextGate')"));
check('governed-start.js instantiates laneGate', governedStartContent.includes('new LaneContextGate'));
check('governed-start.js calls initialize()', governedStartContent.includes('laneGate.initialize()'));
check('governed-start.js checks isOnHold()', governedStartContent.includes('isOnHold()'));

const resolveGovernanceContent = fs.readFileSync(path.join(projectRoot, 'scripts/resolve-governance-v2.js'), 'utf8');
check('resolve-governance-v2.js accepts laneGate injection', resolveGovernanceContent.includes('this.laneGate = options.laneGate'));
check('resolve-governance-v2.js has guardedWriteFile method', resolveGovernanceContent.includes('guardedWriteFile'));
check('resolve-governance-v2.js uses guardedWriteFile for quarantine', resolveGovernanceContent.includes('this.guardedWriteFile(quarantinePath'));
check('resolve-governance-v2.js uses guardedWriteFile for result', resolveGovernanceContent.includes('this.guardedWriteFile(resultPath'));

const appJsContent = fs.readFileSync(path.join(projectRoot, 'src/app.js'), 'utf8');
check('app.js accepts laneGate parameter', appJsContent.includes('constructor(laneGate = null)'));
check('app.js passes laneGate to ScalingManager', appJsContent.includes('new ScalingManager(laneGate)'));
check('app.js passes laneGate to ExperimentationEngine', appJsContent.includes('new ExperimentationEngine(laneGate)'));

const scalingManagerContent = fs.readFileSync(path.join(projectRoot, 'src/core/scalingManager.js'), 'utf8');
check('scalingManager.js accepts laneGate', scalingManagerContent.includes('constructor(laneGate = null)'));
check('scalingManager.js stores laneGate', scalingManagerContent.includes('this.laneGate = laneGate'));
check('scalingManager.js injects into agents', scalingManagerContent.includes('new AgentClass(agentId, this.laneGate)'));

const agentContent = fs.readFileSync(path.join(projectRoot, 'src/core/agent.js'), 'utf8');
check('agent.js accepts laneGate', agentContent.includes('constructor(id, name, role, maxTraceLength = 1000, laneGate = null)'));

// 3. Verify all agent constructors updated
console.log('\n[3] Agent Constructors:');
const coderContent = fs.readFileSync(path.join(projectRoot, 'src/agents/coder.js'), 'utf8');
const executorContent = fs.readFileSync(path.join(projectRoot, 'src/agents/executor.js'), 'utf8');
const plannerContent = fs.readFileSync(path.join(projectRoot, 'src/agents/planner.js'), 'utf8');
const reviewerContent = fs.readFileSync(path.join(projectRoot, 'src/agents/reviewer.js'), 'utf8');
const generalistContent = fs.readFileSync(path.join(projectRoot, 'src/agents/generalist/GeneralistAgent.js'), 'utf8');

check('CoderAgent passes laneGate to super', coderContent.includes('super(id, \'Coder\', \'coder\', 1000, laneGate)'));
check('ExecutorAgent passes laneGate to super', executorContent.includes('super(id, \'Executor\', \'executor\', 1000, laneGate)'));
check('PlannerAgent passes laneGate to super', plannerContent.includes('super(id, \'Planner\', \'planner\', 1000, laneGate)'));
check('ReviewerAgent passes laneGate to super', reviewerContent.includes('super(id, \'Reviewer\', \'reviewer\', 1000, laneGate)'));
check('GeneralistAgent passes laneGate to super', generalistContent.includes('super(id, \'Generalist\', \'generalist\', 1000, laneGate)'));

// 4. Verify ownership registry exists
console.log('\n[4] External Dependencies:');
check('FILE_OWNERSHIP_REGISTRY.json exists', fs.existsSync(path.join(governanceRoot, 'FILE_OWNERSHIP_REGISTRY.json')));

// 5. Gate logic verification
console.log('\n[5] LaneContextGate Core Logic:');
const gateContent = fs.readFileSync(path.join(projectRoot, 'src/core/laneContextGate.js'), 'utf8');
check('Gate loads ownership registry', gateContent.includes('loadOwnershipRegistry'));
check('Gate reads session-lock', gateContent.includes('loadSessionLock'));
check('Gate verifies lane context', gateContent.includes('verifyLaneContext'));
check('Gate implements preWriteGate', gateContent.includes('preWriteGate'));
check('Gate has same-lane check', gateContent.includes('targetLane === this.sessionLane'));
check('Gate has authority >= 100 check', gateContent.includes('this.sessionAuthority >= 100'));
check('Gate enters HOLD on block', gateContent.includes('enterHold'));
check('Gate exits HOLD via operator', gateContent.includes('exitHold'));
check('Gate determines lane from path', gateContent.includes('determineLaneFromPath'));

// Summary
console.log('\n' + '='.repeat(60));
if (errors === 0) {
  console.log(`✅ ALL ${checks} CHECKS PASSED`);
  console.log('\nPhase 2 implementation is complete and integrated.');
  console.log('Ready to commit and push.\n');
  process.exit(0);
} else {
  console.log(`❌ ${errors}/${checks} CHECKS FAILED`);
  console.log('Implementation incomplete or incorrect.\n');
  process.exit(1);
}
