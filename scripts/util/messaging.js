/**
 * Messaging Utilities (SwarmMind Local Copy)
 * ORIGIN: Shared pattern across lanes
 * PURPOSE: Sovereign message construction for SwarmMind autonomy
 * DATE: 2026-05-02
 *
 * Note: Pattern shared across lanes. Each lane maintains local copy.
 */

const crypto = require('crypto');

/**
 * Generate consistent content hash
 */
function generateContentHash(content) {
  if (typeof content === 'object') {
    content = JSON.stringify(content);
  }
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Build canonical message structure
 */
function buildCanonicalMessage({
  schemaVersion = '1.3',
  from,
  to,
  type,
  taskKind,
  subject,
  body,
  priority = 'P2',
  requiresAction = false,
  execution = {
    mode: 'manual',
    engine: 'kilo',
    actor: 'lane'
  },
  payload = {
    mode: 'inline',
    compression: 'none'
  },
  evidence = {
    required: true,
    evidence_path: null,
    verified: false,
    verified_by: null,
    verified_at: null
  },
  evidence_exchange = {
    artifact_path: null,
    artifact_type: null,
    delivered_at: null
  },
  heartbeat = {
    status: 'pending',
    last_heartbeat_at: null,
    interval_seconds: 300,
    timeout_seconds: 900
  },
  convergence_gate = null,
  confidence = 8,
  investigation = null,
  timestamp = new Date().toISOString(),
  idempotency_key = null
}) {
  const message = {
    schema_version: schemaVersion,
    idempotency_key: idempotency_key || generateContentHash(from + to + timestamp),
    from,
    to,
    type,
    task_kind: taskKind,
    subject,
    body,
    timestamp,
    requires_action: requiresAction,
    priority,
    payload,
    execution,
    evidence,
    evidence_exchange,
    heartbeat,
    convergence_gate: convergence_gate || {
      claim: null,
      evidence: null,
      verified_by: null,
      contradictions: [],
      status: 'unproven'
    },
    confidence,
    investigation
  };

  return message;
}

/**
 * Validate message structure
 */
function validateMessageStructure(message) {
  const requiredFields = [
    'schema_version', 'idempotency_key', 'from', 'to', 
    'type', 'subject', 'timestamp', 'priority'
  ];
  
  const errors = [];
  
  requiredFields.forEach(field => {
    if (!message[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  });
  
  // Validate schema version
  if (message.schema_version !== '1.3') {
    errors.push(`Unsupported schema version: ${message.schema_version}`);
  }
  
  // Validate priority
  const validPriorities = ['P0', 'P1', 'P2', 'P3'];
  if (!validPriorities.includes(message.priority)) {
    errors.push(`Invalid priority: ${message.priority}`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Enrich message with provenance
 */
function addProvenance(message, agent, lane, sessionId) {
  message.OUTPUT_PROVENANCE = {
    agent,
    lane,
    generated_at: new Date().toISOString(),
    session_id: sessionId
  };
  
  return message;
}

module.exports = {
  generateContentHash,
  buildCanonicalMessage,
  validateMessageStructure,
  addProvenance
};

/**
 * ORIGIN: Shared pattern across all lanes
 * LOCAL COPY FOR SWARMMIND LANE SOVEREIGNTY
 * Last sync: 2026-05-02
 */