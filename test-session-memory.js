/**
 * Test: Session Memory Persistence
 * 
 * Verifies that session memory persists across restarts.
 * 
 * Run: node test-session-memory.js
 */

const { SessionMemory } = require('./src/memory/SessionMemory.js');
const fs = require('fs');
const path = require('path');

const TEST_MEMORY_PATH = path.join(__dirname, '.test-memory', 'sessions.json');

console.log('=== Session Memory Test ===\n');

// Clean up
const testDir = path.dirname(TEST_MEMORY_PATH);
if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
}

// Test 1: Create session memory
console.log('Test 1: Create session memory');
const memory1 = new SessionMemory({ memoryPath: TEST_MEMORY_PATH });
const session1 = memory1.getCurrentSession();

console.log(`  Session ID: ${session1.id}`);
console.log(`  Started: ${session1.started}`);
console.log(`  Active: ${memory1.data.current_session ? 'YES' : 'NO'}`);

if (fs.existsSync(TEST_MEMORY_PATH)) {
    console.log('  ✓ Session file created\n');
} else {
    console.log('  ✗ Session file NOT created');
    process.exit(1);
}

// Test 2: Record some activity
console.log('Test 2: Record activity');
memory1.recordDecision('Use file-backed storage', 'Simpler than database, works immediately');
memory1.recordFileChange('/src/memory/SessionMemory.js', 'created', 'New session memory module');
memory1.recordInsight('Keep it minimal - 100 lines is enough to start');

console.log(`  Decisions: ${session1.decisions.length}`);
console.log(`  File changes: ${session1.files_changed.length}`);
console.log(`  Insights: ${session1.key_insights.length}`);
console.log('  ✓ Activity recorded\n');

// Test 3: End session
console.log('Test 3: End session');
const ended = memory1.endSession(
    'Built simple session memory layer',
    ['Add context loading', 'Test across restarts', 'Add to other lanes']
);

console.log(`  Ended: ${ended.ended}`);
console.log(`  Summary: ${ended.summary}`);
console.log(`  Next steps: ${ended.next_steps.length}`);
console.log('  ✓ Session ended\n');

// Test 4: Create new instance - should load previous session
console.log('Test 4: New instance loads previous session');
const memory2 = new SessionMemory({ memoryPath: TEST_MEMORY_PATH });
const lastSession = memory2.getLastSession();

console.log(`  Last session ID: ${lastSession.id}`);
console.log(`  Summary: ${lastSession.summary}`);
console.log(`  Decisions: ${lastSession.decisions.length}`);

if (lastSession.summary === 'Built simple session memory layer') {
    console.log('  ✓ Previous session loaded\n');
} else {
    console.log('  ✗ Previous session NOT loaded correctly');
    process.exit(1);
}

// Test 5: Generate context
console.log('Test 5: Generate context for new session');
const context = memory2.generateContext();
console.log('  Generated context:');
console.log('  ' + context.split('\n').slice(0, 6).join('\n  '));
console.log('  ✓ Context generated\n');

// Test 6: Stats
console.log('Test 6: Memory stats');
const stats = memory2.getStats();
console.log(`  Total sessions: ${stats.total_sessions}`);
console.log(`  Has active session: ${stats.has_active_session}`);
console.log(`  Last updated: ${stats.last_updated}`);
console.log('  ✓ Stats available\n');

// Cleanup
console.log('=== All tests passed ===');
console.log(`Test memory at: ${testDir}`);
console.log('(You can delete this directory)');
