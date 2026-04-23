const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VALID_LANES = ['archivist', 'library', 'swarmmind', 'kernel'];
const VALID_VERSIONS = ['1.0', '1.1', '1.2', '1.3', '1.4'];
const VALID_PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
const VALID_TYPES = ['task', 'status', 'ack', 'proposal', 'review', 'alert', 'response', 'heartbeat', 'escalation', 'handoff'];
const VALID_HEARTBEAT_STATUSES = ['pending', 'in_progress', 'active', 'done', 'failed', 'escalated', 'timed_out'];
const VALID_EXECUTION_ACTORS = ['lane', 'subagent', 'watcher'];
const VALID_PAYLOAD_COMPRESSIONS = ['none', 'gzip', 'zstd'];
const VALID_EVIDENCE_EXCHANGE_ARTIFACT_TYPES = ['benchmark', 'profile', 'release', 'log'];
const REQUIRED_FIELDS = [
  'schema_version', 'id', 'task_id', 'idempotency_key',
  'from', 'to', 'type', 'priority', 'subject', 'timestamp',
  'signature', 'key_id', 'content_hash'
];
const CONTENT_HASH_RE = /^sha256:[a-f0-9]{64}$/;
const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;

class InboxMessageSchema {
  constructor(options = {}) {
    const schemaPath = options.schemaPath || path.join(__dirname, '..', '..', 'schemas', 'inbox-message-v1.json');
    this.schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  }

  validate(msg) {
    const errors = [];
    const warnings = [];
    let depth = 0;

    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
      errors.push('Message must be a non-null object');
      return { valid: false, errors, warnings, depth: 0 };
    }

    const missing = REQUIRED_FIELDS.filter(f => !Object.prototype.hasOwnProperty.call(msg, f) || msg[f] === '' || msg[f] === null || msg[f] === undefined);
    if (missing.length > 0) {
      errors.push(`Missing or empty required fields: ${missing.join(', ')}`);
      return { valid: false, errors, warnings, depth: 0 };
    }
    depth = 1;

    if (!VALID_VERSIONS.includes(msg.schema_version)) {
      errors.push(`schema_version must be one of ${VALID_VERSIONS.join(', ')}, got "${msg.schema_version}"`);
    }

    if (!VALID_LANES.includes(msg.from)) {
      errors.push(`from must be a known lane: ${VALID_LANES.join(', ')}, got "${msg.from}"`);
    }

    if (!VALID_LANES.includes(msg.to)) {
      errors.push(`to must be a known lane: ${VALID_LANES.join(', ')}, got "${msg.to}"`);
    }

    if (!VALID_PRIORITIES.includes(msg.priority)) {
      errors.push(`priority must be one of ${VALID_PRIORITIES.join(', ')}, got "${msg.priority}"`);
    }

    if (!VALID_TYPES.includes(msg.type)) {
      errors.push(`type must be one of ${VALID_TYPES.join(', ')}, got "${msg.type}"`);
    }

    const tsParsed = this._parseTimestamp(msg.timestamp);
    if (!tsParsed) {
      errors.push(`timestamp is not valid ISO 8601: "${msg.timestamp}"`);
    } else if (tsParsed > Date.now()) {
      errors.push(`timestamp is from the future: "${msg.timestamp}"`);
    }

    if (!ISO8601_RE.test(msg.id) && !/^\d{4}-\d{2}-\d{2}T/.test(msg.id)) {
      warnings.push(`id does not follow ISO timestamp prefix pattern: "${msg.id}"`);
    }

    if (errors.length === 0) {
      depth = 2;
    } else {
      return { valid: false, errors, warnings, depth };
    }

    if (msg.from === msg.to) {
      errors.push(`from and to must differ (self-addressing not allowed): both "${msg.from}"`);
    }

    if (msg.idempotency_key && msg.from) {
      if (!msg.idempotency_key.includes(msg.from)) {
        errors.push(`idempotency_key must contain or end with sender lane name "${msg.from}", got "${msg.idempotency_key}"`);
      }
    }

    if (Object.prototype.hasOwnProperty.call(msg, 'content_hash')) {
      if (!CONTENT_HASH_RE.test(msg.content_hash)) {
        errors.push(`content_hash must match pattern sha256:[a-f0-9]{64}, got "${msg.content_hash}"`);
      }
    }

    if (Object.prototype.hasOwnProperty.call(msg, 'signature')) {
      if (!Object.prototype.hasOwnProperty.call(msg, 'key_id') || !msg.key_id) {
        errors.push('signature requires key_id to be present and non-empty');
      }
    }

    if (Object.prototype.hasOwnProperty.call(msg, 'key_id') && !Object.prototype.hasOwnProperty.call(msg, 'signature')) {
      errors.push('key_id present without signature — signature is required');
    }

    if (msg.schema_version === '1.0') {
      if (Object.prototype.hasOwnProperty.call(msg, 'payload')) {
        warnings.push('payload is a v1.1 extension on a v1.0 message');
      }
      if (Object.prototype.hasOwnProperty.call(msg, 'execution')) {
        warnings.push('execution is a v1.1 extension on a v1.0 message');
      }
      // v1.0 compat: accept from_lane/to_lane if from/to missing
      if (!Object.prototype.hasOwnProperty.call(msg, 'from') && Object.prototype.hasOwnProperty.call(msg, 'from_lane')) {
        warnings.push('from_lane is deprecated in v1.1; use "from" instead');
      }
      if (!Object.prototype.hasOwnProperty.call(msg, 'to') && Object.prototype.hasOwnProperty.call(msg, 'to_lane')) {
        warnings.push('to_lane is deprecated in v1.1; use "to" instead');
      }
    }

    // v1.1+ specific validations (apply to 1.1, 1.2, 1.3)
    if (['1.1', '1.2', '1.3'].includes(msg.schema_version)) {
      // Reject from_lane/to_lane on v1.1+ messages
      if (Object.prototype.hasOwnProperty.call(msg, 'from_lane')) {
        errors.push('v1.1+ messages must use "from" not "from_lane"');
      }
      if (Object.prototype.hasOwnProperty.call(msg, 'to_lane')) {
        errors.push('v1.1+ messages must use "to" not "to_lane"');
      }

      // Validate heartbeat.status enum
      if (msg.heartbeat && typeof msg.heartbeat === 'object' && msg.heartbeat.status) {
        if (!VALID_HEARTBEAT_STATUSES.includes(msg.heartbeat.status)) {
          errors.push(`heartbeat.status must be one of ${VALID_HEARTBEAT_STATUSES.join(', ')}, got "${msg.heartbeat.status}"`);
        }
      }

      // Validate execution.actor enum
      if (msg.execution && typeof msg.execution === 'object' && msg.execution.actor) {
        if (!VALID_EXECUTION_ACTORS.includes(msg.execution.actor)) {
          errors.push(`execution.actor must be one of ${VALID_EXECUTION_ACTORS.join(', ')}, got "${msg.execution.actor}"`);
        }
      }

      // Validate payload.compression enum
      if (msg.payload && typeof msg.payload === 'object' && msg.payload.compression) {
        if (!VALID_PAYLOAD_COMPRESSIONS.includes(msg.payload.compression)) {
          errors.push(`payload.compression must be one of ${VALID_PAYLOAD_COMPRESSIONS.join(', ')}, got "${msg.payload.compression}"`);
        }
      }
    }

// v1.2+ specific validations
  if (['1.2', '1.3', '1.4'].includes(msg.schema_version)) {
    if (!msg.signature || msg.signature === '') {
      errors.push('v1.2+ requires non-empty signature field');
    }
    if (!msg.key_id || msg.key_id === '') {
      errors.push('v1.2+ requires non-empty key_id field');
    }
  }

  // UNIVERSAL: evidence_hash required on all actionable message types
  if (['task', 'response', 'escalation', 'handoff'].includes(msg.type)) {
    if (!msg.evidence_hash || !/^sha256:[a-f0-9]{64}$/.test(msg.evidence_hash)) {
      errors.push('evidence_hash is universally required on task/response/escalation/handoff messages');
    }
  }

  // evidence block validation (all versions)
  if (msg.evidence && typeof msg.evidence === 'object') {
    if (!Object.prototype.hasOwnProperty.call(msg.evidence, 'required')) {
      warnings.push('evidence object should include "required" field');
    }
  }

  // evidence_hash validation: pattern check + integrity verification
  if (msg.evidence_hash) {
    if (!/^sha256:[a-f0-9]{64}$/.test(msg.evidence_hash)) {
      errors.push(`evidence_hash must match sha256 pattern, got "${msg.evidence_hash}"`);
    } else if (msg.evidence && typeof msg.evidence === 'object') {
      const computed = 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(msg.evidence)).digest('hex');
      if (computed !== msg.evidence_hash) {
        errors.push(`evidence_hash mismatch: computed ${computed} vs provided ${msg.evidence_hash}`);
      }
    }
  } else if (msg.evidence && typeof msg.evidence === 'object') {
    errors.push('evidence object present but evidence_hash missing — evidence_hash is mandatory when evidence is provided');
  }

    // evidence_exchange block validation (v1.3+)
    if (msg.evidence_exchange && typeof msg.evidence_exchange === 'object') {
      const ee = msg.evidence_exchange;
      if (!ee.artifact_path || typeof ee.artifact_path !== 'string' || ee.artifact_path.length === 0) {
        errors.push('evidence_exchange.artifact_path is required and must be a non-empty string');
      }
      if (!ee.artifact_type || !VALID_EVIDENCE_EXCHANGE_ARTIFACT_TYPES.includes(ee.artifact_type)) {
        errors.push(`evidence_exchange.artifact_type must be one of ${VALID_EVIDENCE_EXCHANGE_ARTIFACT_TYPES.join(', ')}, got "${ee.artifact_type}"`);
      }
      if (!ee.delivered_at || !ISO8601_RE.test(ee.delivered_at)) {
        errors.push(`evidence_exchange.delivered_at must be valid ISO 8601, got "${ee.delivered_at}"`);
      }
    } else if (msg.schema_version === '1.3' && msg.type === 'task') {
      // v1.3 task messages SHOULD include evidence_exchange
      warnings.push('v1.3 task messages should include evidence_exchange block');
    }

    depth = errors.length === 0 ? 3 : 2;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      depth
    };
  }

  _parseTimestamp(ts) {
    if (typeof ts !== 'string') return null;
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d.getTime();
  }
}

module.exports = { InboxMessageSchema };
