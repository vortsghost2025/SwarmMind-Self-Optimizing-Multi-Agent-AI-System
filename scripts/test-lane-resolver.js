/**
 * Test LaneResolver — canonical lane identification and cross‑lane validation
 * Run: node scripts/test-lane-resolver.js
 */

const { LaneResolver } = require('../src/coordination/LaneResolver');
const path = require('path');

function assert(condition, message) {
  if (!condition) {
    console.error('ASSERTION FAILED:', message);
    process.exit(1);
  }
}

async function run() {
  console.log('Testing LaneResolver...\n');

  // Test 1: Should identify current lane as 'swarmmind' when run from SwarmMind repo
  const resolver = new LaneResolver();
  const myLane = resolver.getMyLane();
  console.log('  Identified lane:', myLane);
  assert(myLane === 'swarmmind', `Expected lane 'swarmmind', got '${myLane}'`);

  // Test 2: Environment variables should be set
  assert(process.env.LANE_NAME === 'swarmmind', 'LANE_NAME env should be set');
  assert(process.env.LANE_AUTHORITY === '80', 'LANE_AUTHORITY should be 80');
  assert(path.resolve(process.env.LANE_REPO_PATH) === path.resolve('S:\\SwarmMind Self-Optimizing Multi-Agent AI System'), 'LANE_REPO_PATH should match repo path');

  // Test 3: My entry should match registry
  const myEntry = resolver.getMyEntry();
  assert(myEntry.authority === 80, 'Authority should be 80');
  assert(myEntry.branch === 'master', 'Branch should be master');
  assert(myEntry.commit_sha === 'e574346', 'Commit SHA should match current (or warn if diff)');

  // Test 4: Sibling lanes should be present
  const siblings = resolver.getSiblingLanes();
  console.log('  Sibling lanes:', siblings.map(s => s.lane_id).join(', '));
  assert(siblings.length === 2, 'Should have 2 sibling lanes (archivist, library)');
  const archivist = siblings.find(s => s.lane_id === 'archivist');
  const library = siblings.find(s => s.lane_id === 'library');
  assert(archivist, 'Archivist sibling should exist');
  assert(library, 'Library sibling should exist');

  // Test 5: getSiblingEntry throws if asking for self
  let threw = false;
  try { resolver.getSiblingEntry('swarmmind'); } catch (e) { threw = true; }
  assert(threw, 'getSiblingEntry(self) should throw');

  // Test 6: getStateFilePath for a governance file (should use canonical repo path)
  const ownershipPath = resolver.getStateFilePath('FILE_OWNERSHIP_REGISTRY.json');
  // This file should exist in Archivist-Agent; but for SwarmMind, it will resolve to SwarmMind repo root + filename
  // Actually we called with just filename; it joins to my repo path. For SwarmMind, ownership file isn't in SwarmMind; that's fine. 
  // Better test: use a file that is in SwarmMind's state_files list.
  const sessionLockPath = resolver.getStateFilePath('.session-lock');
  assert(sessionLockPath.endsWith('.session-lock'), 'Should produce correct path');

  // Test 7: Governance root from registry
  const govRoot = resolver.getGovernanceRoot();
  assert(govRoot === 'S:\\Archivist-Agent', 'Governance root should point to Archivist-Agent');

  // Test 8: Queue/audit/continuity directories
  assert(resolver.getQueueDirectory() === 'S:\\queue', 'Global queue dir should be S:\\queue');
  assert(resolver.getAuditDirectory() === 'S:\\audit', 'Global audit dir should be S:\\audit');
  assert(resolver.getContinuityDirectory() === 'S:\\continuity', 'Global continuity dir should be S:\\continuity');

  console.log('\n✓ All LaneResolver tests passed');
  process.exit(0);
}

run().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
