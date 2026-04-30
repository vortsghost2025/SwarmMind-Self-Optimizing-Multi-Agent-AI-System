const crypto = require('crypto');
const fs = require('fs');

function createBatchWrapper(batchId, lane, nodeResponses) {
  return {
    schema_version: '1.3',
    task_id: `contradiction-batch-${batchId}-responses-20260430`,
    idempotency_key: `batch${batchId}-resp-${crypto.randomUUID()}`,
    from: lane,
    to: 'archivist',
    type: 'response',
    task_kind: 'ratification',
    priority: 'P1',
    subject: `Contradiction Batch ${batchId} — ${lane.charAt(0).toUpperCase() + lane.slice(1)} lane responses`,
    body: `${lane.toUpperCase()} responses for Batch ${batchId} contradiction nodes. ${nodeResponses.length} node(s) classified.`,
    timestamp: new Date().toISOString(),
    requires_action: true,
    payload: { mode: 'inline', compression: 'none' },
    execution: { mode: 'manual', engine: 'opencode', actor: 'lane' },
    lease: { owner: lane, acquired_at: new Date().toISOString(), expires_at: null, renewal_count: 0, max_renewals: 3 },
    retry: { attempt: 1, max_attempts: 3, last_error: null, last_attempt_at: null },
    evidence: { required: true, verified: false },
    evidence_exchange: { artifact_type: 'batch_response', artifact_path: `S:/library/evidence/contradiction-resolution/batch${batchId}-responses-20260430.json` },
    heartbeat: { interval_seconds: 300, last_heartbeat_at: new Date().toISOString(), timeout_seconds: 900, status: 'done' },
    responses: nodeResponses
  };
}

// ===== LIBRARY BATCH 1 RESPONSE =====
// Node: 45d50e60309ef11c (Library-assigned)
const libraryBatch1 = createBatchWrapper(1, 'library', [{
  node_id: '45d50e60309ef11c',
  status: 'needs_lane_review',
  edge_evidence: 'Archivist-Agent artifact (contradictionCount=65, CONFLICTED) with Library cross-tagging; no explicit CONTRADICTS edges found in Archivist-Agent graph snapshot analysis. Library cannot produce edge provenance without Archivist supplying the semantic conflict artifacts.',
  confidence: 'medium',
  next_action: 'Await Archivist CONTRADICTS edge evidence for 45d50e60309ef11c'
}]);

// ===== LIBRARY BATCH 2 RESPONSE =====
// Node: 8f11fb5f4a3a5efc only (Library-assigned). b6a19d32a8604205 is Archivist-origin and covered separately.
const libraryBatch2 = createBatchWrapper(2, 'library', [
  {
    node_id: '8f11fb5f4a3a5efc',
    status: 'needs_lane_review',
    edge_evidence: 'Library-assigned node from Archivist-Agent; appears in contradiction hub with CONFLICTED status and 65 contradictions; Library cross-tagged. No CONTRADICTS edges found in graph snapshot; Library cannot produce provenance without Archivist edge artifacts.',
    confidence: 'medium',
    next_action: 'Await Archivist CONTRADICTS edge evidence for 8f11fb5f4a3a5efc'
  }
]);

// Write files
const lDir = 'S:/self-organizing-library/lanes/library/inbox/quarantine';
fs.mkdirSync(lDir, { recursive: true });
fs.writeFileSync(`${lDir}/contradiction-batch-1-responses-20260430.json`, JSON.stringify(libraryBatch1, null, 2));
fs.writeFileSync(`${lDir}/contradiction-batch-2-responses-20260430.json`, JSON.stringify(libraryBatch2, null, 2));

console.log('Library contradiction batch responses written:');
console.log('  Batch 1:', `${lDir}/contradiction-batch-1-responses-20260430.json`);
console.log('  Batch 2:', `${lDir}/contradiction-batch-2-responses-20260430.json`);
