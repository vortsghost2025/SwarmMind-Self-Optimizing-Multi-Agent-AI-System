const fs = require('fs');
const path = require('path');

const VALID_LANES = ['archivist', 'library', 'swarmmind', 'kernel'];
const VALID_VERSIONS = ['1.0', '1.1'];
const VALID_PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
const VALID_TYPES = ['task', 'status', 'ack', 'proposal', 'review', 'alert'];
const REQUIRED_FIELDS = [
  'schema_version', 'id', 'task_id', 'idempotency_key',
  'from', 'to', 'type', 'priority', 'subject', 'timestamp'
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
      warnings.push('key_id present without signature; key_id is only meaningful with signature');
    }

    if (msg.schema_version === '1.0') {
      if (Object.prototype.hasOwnProperty.call(msg, 'payload')) {
        warnings.push('payload is a v1.1 extension on a v1.0 message');
      }
      if (Object.prototype.hasOwnProperty.call(msg, 'execution')) {
        warnings.push('execution is a v1.1 extension on a v1.0 message');
      }
    }

    if (msg.evidence && typeof msg.evidence === 'object') {
      if (!Object.prototype.hasOwnProperty.call(msg.evidence, 'required')) {
        warnings.push('evidence object should include "required" field');
      }
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
