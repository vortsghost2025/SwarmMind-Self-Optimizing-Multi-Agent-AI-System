const crypto = require('crypto');
const fs = require('fs');
const { getRoots, sToLocal, LANES: _DL } = require('./util/lane-discovery');


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
    evidence_exchange: { artifact_type: 'batch_response', artifact_path: `S:/archivist/evidence/contradiction-resolution/batch${batchId}-responses-20260430.json` },
  heartbeat: { interval_seconds: 300, last_heartbeat_at: new Date().toISOString(), timeout_seconds: 900, status: 'done' },
  confidence: 7,
  investigation: null,
  responses: nodeResponses
  };
}

// ===== ARCHIVIST BATCH 1 SELF-REVIEW =====
const archivistBatch1 = createBatchWrapper(1, 'archivist', [{
  node_id: '1d846649979dcec1',
  status: 'proven_spurious',
  edge_evidence: 'Archivist self-review: Node is internal documentation artifact (LANEMESSAGEINDEX.md region). No CONTRADICTS edges exist in any graph snapshot; contradictionCount=65 is a false-positive cluster tag overlap. CONFLICTED status is artifact-derived classification noise; semantic conflict non-credible. Lineage: local doc → governance annex.',
  confidence: 9,
  next_action: 'Mark as proven_spurious; suppress escalation; archive as false-positive artifact classification'
}]);

// ===== ARCHIVIST BATCH 2 SELF-REVIEW =====
const archivistBatch2 = createBatchWrapper(2, 'archivist', [
  {
    node_id: 'a88504c97e8f2e4f',
    status: 'proven_spurious',
    edge_evidence: 'Archivist self-review: Node is internal Archivist-Agent governance artifact; no CONTRADICTS edges to external lanes exist. contradictionCount=65 reflects shared-tag co-occurrence, not semantic conflict. Classified as false-positive; artifact provenance is internal governance documentation.',
  confidence: 9,
  next_action: 'Mark as proven_spurious; suppress escalation'
  },
  {
    node_id: 'b6a19d32a8604205',
    status: 'proven_spurious',
    edge_evidence: 'Archivist self-review: Internal governance artifact; no CONTRADICTS edges present in any graph snapshot. Status CONFLICTED is false-positive artifact classification; 65 contradiction tags are metadata-level co-occurrence, not semantic conflict.',
  confidence: 9,
  next_action: 'Mark as proven_spurious; archive as artifact-class contradiction'
  },
  {
    node_id: '044d760a04bbfa30',
    status: 'proven_spurious',
  edge_evidence: 'Archivist self-review: Node is Archivist-Agent internal governance artifact; no CONTRADICTS edge chain exists. ContradictionCount=65 is tag-based clustering artifact, not semantic conflict. Classified as proven_spurious with high confidence.',
  confidence: 9,
    next_action: 'Suppress escalation; mark as false-positive artifact classification'
  }
]);

// ===== ARCHIVIST BATCH 3 SELF-REVIEW =====
const archivistBatch3 = createBatchWrapper(3, 'archivist', [{
  node_id: 'd52d670ab9d41169',
  status: 'proven_spurious',
  edge_evidence: 'Archivist self-review: Internal governance artifact; no CONTRADICTS edges exist. CONFLICTED status and contradictionCount=65 are artifact-derived false positives from shared-tag clustering; semantic conflict absent. Classified as proven_spurious.',
  confidence: 9,
  next_action: 'Archive as proven_spurious; no further action'
}]);

// Write files
const aDir = sToLocal('S:/Archivist-Agent/lanes/archivist/inbox/quarantine');
fs.mkdirSync(aDir, { recursive: true });
fs.writeFileSync(`${aDir}/contradiction-batch-1-responses-20260430.json`, JSON.stringify(archivistBatch1, null, 2));
fs.writeFileSync(`${aDir}/contradiction-batch-2-responses-20260430.json`, JSON.stringify(archivistBatch2, null, 2));
fs.writeFileSync(`${aDir}/contradiction-batch-3-responses-20260430.json`, JSON.stringify(archivistBatch3, null, 2));

console.log('Archivist self-review contradiction responses written:');
console.log('  Batch 1:', `${aDir}/contradiction-batch-1-responses-20260430.json`);
console.log('  Batch 2:', `${aDir}/contradiction-batch-2-responses-20260430.json`);
console.log('  Batch 3:', `${aDir}/contradiction-batch-3-responses-20260430.json`);
