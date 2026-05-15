const crypto = require('crypto');
const fs = require('fs');
const { getRoots, sToLocal, LANES: _DL } = require('./util/lane-discovery');


// Helper to create schema-valid batch response wrapper
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
    evidence_exchange: { artifact_type: 'batch_response', artifact_path: `S:/${lane}/evidence/contradiction-resolution/batch${batchId}-responses-20260430.json` },
  heartbeat: { interval_seconds: 300, last_heartbeat_at: new Date().toISOString(), timeout_seconds: 900, status: 'done' },
  confidence: 7,
  investigation: null,
  responses: nodeResponses
  };
}

// ===== KERNEL BATCH 1 RESPONSE =====
// Node: 1d846649979dcec1 (Archivist origin) + 45d50e60309ef11c (Library origin, as requested: "Kernel provide its 4 pending responses").
const kernelBatch1 = createBatchWrapper(1, 'kernel', [
  {
    node_id: '1d846649979dcec1',
    status: 'needs_lane_review',
    edge_evidence: 'Archivist-origin node in Batch 1; no CONTRADICTS edges found in Archivist-Agent graph snapshot. Kernel cannot validate lineage without Archivist-provided edge artifacts.',
    confidence: 'medium',
    next_action: 'Await Archivist CONTRADICTS edge evidence for 1d846649979dcec1'
  },
  {
    node_id: '45d50e60309ef11c',
    status: 'needs_lane_review',
    edge_evidence: 'Library-assigned node in Batch 1; Archivist-origin artifact; no CONTRADICTS edges visible in current snapshot. Requires Archivist to supply explicit edge-level conflict evidence.',
    confidence: 'medium',
    next_action: 'Archivist to provide CONTRADICTS edge artifacts for 45d50e60309ef11c'
  }
]);

// ===== KERNEL BATCH 2 RESPONSE =====
// Nodes: a88504c97e8f2e4f (Archivist origin), b6a19d32a8604205 (Archivist origin)
const kernelBatch2 = createBatchWrapper(2, 'kernel', [
  {
    node_id: 'a88504c97e8f2e4f',
    status: 'needs_lane_review',
    edge_evidence: 'Node appears in contradiction hub (Archivist-Agent) with CONFLICTED status and 65 contradictions; no explicit CONTRADICTS edges resolvable from current graph snapshot. Cannot adjudicate without semantic conflict edge evidence.',
    confidence: 'medium',
    next_action: 'Archivist to provide CONTRADICTS edge artifacts for a88504c97e8f2e4f'
  },
  {
    node_id: 'b6a19d32a8604205',
    status: 'needs_lane_review',
    edge_evidence: 'Archivist-origin node marked CONFLICTED (contradictionCount=65); CONTRADICTS edge chain not visible in available snapshot. Requires explicit edge-level evidence from Archivist.',
    confidence: 'medium',
    next_action: 'Archivist to submit CONTRADICTS edge provenance for b6a19d32a8604205'
  }
]);

// ===== KERNEL BATCH 3 RESPONSE =====
// Node: e0e603e85e1972ea — this Kernel node already accepted as proven_spurious in merge table
const kernelBatch3 = createBatchWrapper(3, 'kernel', [{
  node_id: 'e0e603e85e1972ea',
  status: 'proven_spurious',
  edge_evidence: 'CONFIRMED: Kernel-origin node previously ratified as proven_spurious based on truth-routing.ts K(40) artifact in Failure Mode tag; semantic conflict disproven. Evidence: truth-routing.ts lines 79-82,251-252,284-289; K(40) artifact in Failure Mode tag.',
  confidence: 'high',
  next_action: 'Mark as artifact-derived contradiction; suppress escalation; already accepted in merge table'
}]);

// Write files
const kDir = sToLocal('S:/kernel-lane/lanes/kernel/inbox/quarantine');
fs.mkdirSync(kDir, { recursive: true });
fs.writeFileSync(`${kDir}/contradiction-batch-1-responses-20260430.json`, JSON.stringify(kernelBatch1, null, 2));
fs.writeFileSync(`${kDir}/contradiction-batch-2-responses-20260430.json`, JSON.stringify(kernelBatch2, null, 2));
fs.writeFileSync(`${kDir}/contradiction-batch-3-responses-20260430.json`, JSON.stringify(kernelBatch3, null, 2));

console.log('Kernel contradiction batch responses written:');
console.log('  Batch 1:', `${kDir}/contradiction-batch-1-responses-20260430.json`);
console.log('  Batch 2:', `${kDir}/contradiction-batch-2-responses-20260430.json`);
console.log('  Batch 3:', `${kDir}/contradiction-batch-3-responses-20260430.json`);
