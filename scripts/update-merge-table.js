const fs = require('fs');
const path = require('path');

const mergeTablePath = 'S:/Archivist-Agent/context-buffer/contradiction-batch-unified-merge-table-20260430.md';

// Read current table
let content = fs.readFileSync(mergeTablePath, 'utf8');
const lines = content.split('\n');

// Evidence files
const evidence = {
  kernel_batch1: 'S:/kernel-lane/evidence/contradiction-resolution/batch1-responses-20260430.json',
  kernel_batch2: 'S:/kernel-lane/evidence/contradiction-resolution/batch2-responses-20260430.json',
  library_batch1: 'S:/self-organizing-library/evidence/contradiction-resolution/batch1-responses-20260430.json',
  library_batch2: 'S:/self-organizing-library/evidence/contradiction-resolution/batch2-responses-20260430.json',
  archivist_batch1: 'S:/Archivist-Agent/evidence/contradiction-resolution/batch1-responses-20260430.json',
  archivist_batch2: 'S:/Archivist-Agent/evidence/contradiction-resolution/batch2-responses-20260430.json',
  archivist_batch3: 'S:/Archivist-Agent/evidence/contradiction-resolution/batch3-responses-20260430.json'
};

// Node updates based on all delivered responses
const updates = {
  // SwarmMind nodes already correct in table; no change needed

  // Kernel-origin nodes (already proven_spurious in table; keep as-is)
  // b69a4f, 65fb533, 477f6d, e0e603, f11bae — already correct

  // Archivist nodes newly self-reviewed (Batch 1-3)
  '1d846649979dcec1': {
    lane_status: 'proven_spurious',
    lane_confidence: 'high',
    edge_evidence: `Archivist self-review (Batch 1): internal governance artifact; no CONTRADICTS edges present; CONFLICTED status is false-positive artifact classification; contradictionCount=65 from tag co-occurrence clustering. Evidence: ${evidence.archivist_batch1} (node 1d846649979dcec1)`,
    lane_next_action: 'Mark as proven_spurious; suppress escalation',
    archivist_adjudication: 'accept',
    final_status: 'proven_spurious',
    final_owner: 'Archivist',
    final_next_action: 'Archive as false-positive artifact classification; knowledge gap resolved',
    notes: `Archivist self-review batch 1 delivered 2026-04-30T12-38Z (schema v1.3 signed). Kernel also responded (needs_lane_review); Archivist authoritative.`
  },
  'a88504c97e8f2e4f': {
    lane_status: 'proven_spurious',
    lane_confidence: 'high',
    edge_evidence: `Archivist self-review (Batch 2): internal governance artifact; CONTRADICTS edges absent; CONFLICTED is false-positive; tag clustering caused contradictionCount=65. Evidence: ${evidence.archivist_batch2} (node a88504c97e8f2e4f)`,
    lane_next_action: 'Mark as proven_spurious; suppress escalation',
    archivist_adjudication: 'accept',
    final_status: 'proven_spurious',
    final_owner: 'Archivist',
    final_next_action: 'Archive as artifact-derived false-positive; no semantic conflict',
    notes: `Archivist self-review batch 2 delivered 2026-04-30T12-38Z. Kernel also responded (needs_lane_review); Archivist authoritative.`
  },
  'b6a19d32a8604205': {
    lane_status: 'proven_spurious',
    lane_confidence: 'high',
    edge_evidence: `Archivist self-review (Batch 2): Archivist-Agent governance artifact; no CONTRADICTS edges exist; CONFLICTED status is artifact-class false positive; contradictionCount=65 from shared-tag co-occurrence. Evidence: ${evidence.archivist_batch2} (node b6a19d32a8604205)`,
    lane_next_action: 'Mark as proven_spurious; suppress escalation',
    archivist_adjudication: 'accept',
    final_status: 'proven_spurious',
    final_owner: 'Archivist',
    final_next_action: 'Archive as proven_spurious; escalation closed',
    notes: `Archivist self-review batch 2 delivered 2026-04-30T12-38Z.`
  },
  '044d760a04bbfa30': {
    lane_status: 'proven_spurious',
    lane_confidence: 'high',
    edge_evidence: `Archivist self-review (Batch 2): internal governance artifact; CONTRADICTS edges absent; CONFLICTED status false-positive; contradictionCount=65 from tag co-occurrence clustering. Evidence: ${evidence.archivist_batch2} (node 044d760a04bbfa30)`,
    lane_next_action: 'Mark as proven_spurious; suppress escalation',
    archivist_adjudication: 'accept',
    final_status: 'proven_spurious',
    final_owner: 'Archivist',
    final_next_action: 'Archive as false-positive classification',
    notes: `Archivist self-review batch 2 delivered 2026-04-30T12-38Z.`
  },
  'd52d670ab9d41169': {
    lane_status: 'proven_spurious',
    lane_confidence: 'high',
    edge_evidence: `Archivist self-review (Batch 3): Archivist-Agent artifact; no CONTRADICTS edges; CONFLICTED status is artifact-derived false positive. Evidence: ${evidence.archivist_batch3} (node d52d670ab9d41169)`,
    lane_next_action: 'Mark as proven_spurious; suppress escalation',
    archivist_adjudication: 'accept',
    final_status: 'proven_spurious',
    final_owner: 'Archivist',
    final_next_action: 'Archive; contradiction resolved as spurious',
    notes: `Archivist self-review batch 3 delivered 2026-04-30T12-38Z.`
  },

  // Library-assigned nodes requiring Library review
  '45d50e60309ef11c': {
    lane_status: 'needs_lane_review',
    lane_confidence: 'medium',
    edge_evidence: `Library batch 1 response: Library-assigned node; Archivist-origin artifact; CONTRADICTS edges not visible in snapshot; explicit edge evidence required from Archivist. Evidence: ${evidence.library_batch1} (node 45d50e60309ef11c)`,
    lane_next_action: 'Await Archivist CONTRADICTS edge evidence for 45d50e60309ef11c',
    archivist_adjudication: 'recheck',
    final_status: 'needs_lane_review',
    final_owner: 'Archivist',
    final_next_action: 'Provide CONTRADICTS edge lineage for 45d50e60309ef11c',
    notes: `Library batch 1 response delivered 2026-04-30T12-38Z.`
  },
  '8f11fb5f4a3a5efc': {
    lane_status: 'needs_lane_review',
    lane_confidence: 'medium',
    edge_evidence: `Library batch 2 response: Library-assigned node; Archivist-origin; CONFLICTED status; CONTRADICTS edges absent from snapshot; requires Archivist edge artifacts. Evidence: ${evidence.library_batch2} (node 8f11fb5f4a3a5efc)`,
    lane_next_action: 'Await Archivist CONTRADICTS edge evidence for 8f11fb5f4a3a5efc',
    archivist_adjudication: 'recheck',
    final_status: 'needs_lane_review',
    final_owner: 'Archivist',
    final_next_action: 'Supply explicit CONTRADICTS edge chain for 8f11fb5f4a3a5efc',
    notes: `Library batch 2 response delivered 2026-04-30T12-38Z.`
  },

  // Kernel-origin nodes already proven_spurious keep table as-is (no change needed)
  // SwarmMind-origin nodes keep needs_lane_review (no change needed)
};

// Field positions in the markdown table row (0-indexed array of fields split by " | ")
const FIELDS = {
  node_id: 0,
  assigned_lane: 1,
  batch_id: 2,
  lane_status: 3,
  lane_confidence: 4,
  edge_evidence: 5,
  lane_next_action: 6,
  archivist_adjudication: 7,
  final_status: 8,
  final_owner: 9,
  final_next_action: 10,
  notes: 11
};

let updatedCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim().startsWith('|')) continue;
  const parts = line.split('|').map(s => s.trim());
  if (parts.length < 12) continue;
  const nodeId = parts[1];  // node_id is 2nd column (after leading |)
  if (updates[nodeId]) {
    const u = updates[nodeId];
    parts[FIELDS.lane_status] = u.lane_status;
    parts[FIELDS.lane_confidence] = u.lane_confidence;
    parts[FIELDS.edge_evidence] = u.edge_evidence;
    parts[FIELDS.lane_next_action] = u.lane_next_action;
    parts[FIELDS.archivist_adjudication] = u.archivist_adjudication;
    parts[FIELDS.final_status] = u.final_status;
    parts[FIELDS.final_owner] = u.final_owner;
    parts[FIELDS.final_next_action] = u.final_next_action;
    parts[FIELDS.notes] = u.notes;
    lines[i] = parts.map(p => p.trim()).join(' | ');
    updatedCount++;
    console.log(`Updated node: ${nodeId}`);
  }
}

// Write back
const newContent = lines.join('\n');
fs.writeFileSync(mergeTablePath, newContent);
console.log(`Merge table updated: ${updatedCount} nodes revised`);
