/**
 * Test harness for Audit Layer
 * Run with: node scripts/test-audit.js
 */
const { AuditLogger, audit } = require('../src/audit/AuditLogger');
const Queue = require('../src/queue/Queue');
const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) {
    console.error('ASSERTION FAILED:', message);
    process.exit(1);
  }
}

// Clean audit log for deterministic test
if (fs.existsSync(audit.filePath)) {
  fs.unlinkSync(audit.filePath);
  fs.writeFileSync(audit.filePath, '', { flag: 'wx' });
}

// Create a test queue (already hooks audit via auto‑attach)
const q = new Queue('REVIEW');
const item = q.enqueue({
  target_lane: 'library',
  type: 'verification_request',
  artifact_path: 'test.md',
  required_action: 'test'
});
assert(item.id, 'Item should have an ID');

// Change status
q.updateStatus(item.id, 'accepted', 'test passed');

// Verify audit entries were recorded
const allEntries = audit.loadAll();
assert(allEntries.length >= 2, `Expected at least 2 audit entries, got ${allEntries.length}`);

// Check that enqueue event exists
const enqueueEvent = allEntries.find(e => e.event_type === 'enqueue' && e.queue_item_id === item.id);
assert(enqueueEvent, 'Enqueue event should be recorded');

// Check status change event
const statusEvent = allEntries.find(e => e.event_type === 'status_change' && e.queue_item_id === item.id);
assert(statusEvent, 'Status change event should be recorded');
assert(statusEvent.details.newStatus === 'accepted', 'Status should be accepted');

// Test item trace
const trace = audit.traceItem(item.id);
assert(trace.length === 2, `Trace should have 2 events, got ${trace.length}`);

// Test summary report generation
const summary = audit.generateQueueSummary();
assert(summary.REVIEW, 'Summary should include REVIEW queue');
assert(summary.REVIEW.enqueued >= 1, 'Enqueue count should be at least 1');
assert(summary.REVIEW.status_changed >= 1, 'Status change count should be at least 1');

// Export report to temp file
const reportPath = path.join(__dirname, '..', 'audit', 'test_report.md');
if (!fs.existsSync(path.dirname(reportPath))) fs.mkdirSync(path.dirname(reportPath), { recursive: true });
audit.exportReport(reportPath);
assert(fs.existsSync(reportPath), 'Audit report file should exist');

console.log('All Audit tests passed');
process.exit(0);
