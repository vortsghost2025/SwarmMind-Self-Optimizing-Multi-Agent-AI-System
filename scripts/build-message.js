#!/usr/bin/env node
'use strict';

/**
 * build-message.js - v1.1-compliant lane-relay message builder
 *
 * Usage:
 *   node scripts/build-message.js --from swarmmind --to kernel --type ack ^
 *     --priority P1 --subject "ACK: something" --task-id "task-001" ^
 *     --body "Message body text" --send
 *
 * Outputs a v1.1-compliant JSON message to stdout.
 * Also writes to the local outbox and delivers to target inbox if --send is passed.
 */

const fs = require('fs');
const path = require('path');
const { Signer } = require('../src/attestation/Signer');
const { KeyManager } = require('../src/attestation/KeyManager');

// LEASE + ATOMIC WRITE: Require kernel primitives for cross-lane mutation safety
const KERNEL_ROOT = 'S:/kernel-lane';
const { atomicWriteJson, atomicWriteWithLease } = require(path.join(KERNEL_ROOT, 'scripts', 'atomic-write-util'));

const VALID_LANES = ['archivist', 'library', 'swarmmind', 'kernel'];
const VALID_PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
const VALID_TYPES = ['task', 'status', 'ack', 'proposal', 'review', 'alert'];
const VALID_HEARTBEAT_STATUSES = ['pending', 'in_progress', 'done', 'failed', 'escalated', 'timed_out'];
const VALID_EXECUTION_ACTORS = ['lane', 'subagent', 'watcher'];

const OUTBOX_DIR = path.join(__dirname, '..', 'lanes', 'swarmmind', 'outbox');
const PASSFILE_CANDIDATES = [
  path.join(__dirname, '..', '.runtime', 'lane-passphrases.json'),
  'S:/Archivist-Agent/.runtime/lane-passphrases.json'
];

const CANONICAL_INBOX_PATHS = {
  archivist: 'S:/Archivist-Agent/lanes/archivist/inbox',
  library: 'S:/self-organizing-library/lanes/library/inbox',
  swarmmind: 'S:/SwarmMind Self-Optimizing Multi-Agent AI System/lanes/swarmmind/inbox',
  kernel: 'S:/kernel-lane/lanes/kernel/inbox'
};

function buildMessage(options) {
  var from = options.from || 'swarmmind';
  var to = options.to;
  var type = options.type;
  var priority = options.priority;
  var subject = options.subject;
  var taskId = options.taskId;
  var body = options.body || '';
  var requiresAction = options.requiresAction || false;
  var actor = options.actor || 'lane';
  var parentId = options.parentId || null;
  var skipSign = options.skipSign || false;

  // Validation
  var errors = [];
  if (!VALID_LANES.includes(from)) errors.push('Invalid from: ' + from);
  if (!VALID_LANES.includes(to)) errors.push('Invalid to: ' + to);
  if (!VALID_TYPES.includes(type)) errors.push('Invalid type: ' + type);
  if (!VALID_PRIORITIES.includes(priority)) errors.push('Invalid priority: ' + priority);
  if (!subject) errors.push('subject is required');
  if (!taskId) errors.push('taskId is required');
  if (from === to) errors.push('from and to must differ');

  if (errors.length > 0) {
    throw new Error('Message validation failed: ' + errors.join('; '));
  }

  var now = new Date();
  var timestamp = now.toISOString();
  var datePrefix = timestamp.replace(/[:.]/g, '-').slice(0, 19);
  var messageId = datePrefix + 'Z_' + from + '_' + taskId;
  var idempotencyKey = from + '-' + taskId + '-' + datePrefix;

  // Compute content_hash (always, since it's required by schema)
  var msg = {
    schema_version: '1.1',
    id: messageId,
    task_id: taskId,
    idempotency_key: idempotencyKey,
    from: from,
    to: to,
    type: type,
    priority: priority,
    subject: subject,
    timestamp: timestamp,
    requires_action: requiresAction,
    body: body,
    payload: {
      mode: 'inline',
      compression: 'none',
      path: null,
      chunk: {
        index: 0,
        count: 1,
        group_id: null
      }
    },
    execution: {
      mode: 'session_task',
      engine: 'kilo',
      actor: actor,
      session_id: null,
      parent_id: parentId
    },
    lease: {
      owner: from,
      acquired_at: timestamp,
      expires_at: null,
      renew_count: 0,
      max_renewals: 3
    },
    retry: {
      attempt: 1,
      max_attempts: 3,
      last_error: null,
      last_attempt_at: null
    },
    heartbeat: {
      interval_seconds: 300,
      last_heartbeat_at: timestamp,
      timeout_seconds: 900,
      status: 'in_progress'
    },
    watcher: {
      enabled: true,
      poll_seconds: 60,
      p0_fast_path: true,
      max_concurrent: 1,
      heartbeat_required: true,
      stale_after_seconds: 300,
      backoff: {
        initial_seconds: 60,
        max_seconds: 300,
        multiplier: 2
      }
    },
    delivery_verification: {
      verified: false,
      verified_at: null,
      retries: 0
    },
    evidence: {
      required: true,
      evidence_path: 'lanes/' + from + '/outbox/' + messageId + '.json',
      verified: false,
      verified_by: null,
      verified_at: null
    },
    // Required attestation fields (v1.1 hard enforcement)
    content_hash: '', // computed below after all fields set
    signature: '',    // populated by signMessageForOutbox() or signInboxMessage()
    key_id: '',       // populated during signing
    signature_alg: 'RS256'
  };

  // Compute content hash after all fields are set (static method)
  msg.content_hash = Signer.computeContentHash(msg);

  return msg;
}

function resolvePassphrase(lane) {
  if (process.env.LANE_KEY_PASSPHRASE) return process.env.LANE_KEY_PASSPHRASE;
  const laneKeyVar = 'LANE_KEY_PASSPHRASE_' + String(lane || '').toUpperCase();
  if (process.env[laneKeyVar]) return process.env[laneKeyVar];

  for (const passfile of PASSFILE_CANDIDATES) {
    try {
      if (!fs.existsSync(passfile)) continue;
      const parsed = JSON.parse(fs.readFileSync(passfile, 'utf8'));
      if (parsed && typeof parsed === 'object' && parsed[lane]) {
        const val = parsed[lane];
        return typeof val === 'object' && val.passphrase ? val.passphrase : val;
      }
    } catch (_) {}
  }
  return null;
}

function signMessageForOutbox(msg, lane) {
  const passphrase = resolvePassphrase(lane);
  if (!passphrase) {
    throw new Error('Passphrase missing for lane: ' + lane);
  }

  const identityDir = path.join(__dirname, '..', '.identity');
  const km = new KeyManager({ laneId: lane, identityDir: identityDir });
  if (!km.hasKeys()) {
    throw new Error('SIGNING_KEYS_MISSING: ' + identityDir);
  }

  const privateKey = km.loadPrivateKey(passphrase);
  const info = km.getPublicKeyInfo();
  if (!info || !info.key_id) {
    throw new Error('KEY_ID_UNAVAILABLE for lane: ' + lane);
  }

  const signer = new Signer();
  return signer.signInboxMessage(msg, privateKey, info.key_id);
}

// Wrapper for sync caller - calls async lease+atomic write
function writeWithLease(filePath, data, laneName) {
  return atomicWriteWithLease(filePath, data, laneName, 30000);
}

async function deliverMessage(msg, send) {
  var filename = msg.id + '.json';
  var outboxPath = path.join(OUTBOX_DIR, filename);

  // Sign the message before delivering/writing — FAIL CLOSED
  var finalMsg;
  try {
    finalMsg = signMessageForOutbox(msg, msg.from || 'swarmmind');
  } catch (signErr) {
    console.error('[build-message] FATAL: Could not sign message: ' + signErr.message);
    return false;
  }
    console.error('[build-message] Outbox write BLOCKED — unsigned messages are rejected by schema v1.2');
    return false;
  }

  // Guard: NON-BYPASSABLE outbox write enforcement
  // guardWrite() throws OUTBOX_GUARD_REJECTED on any violation — this is intentional.
  // If the outbox-write-guard module cannot be loaded, the write is BLOCKED (fail-closed).
  var guardWrite;
  try { ({ guardWrite } = require('./outbox-write-guard')); } catch (loadErr) {
    console.error('[build-message] FATAL: outbox-write-guard module failed to load — write BLOCKED (fail-closed)');
    console.error('[build-message] Load error: ' + loadErr.message);
    return false;
  }
  try {
    guardWrite(finalMsg, OUTBOX_DIR, filename);
  } catch (guardErr) {
    console.error('[build-message] FATAL: Outbox guard rejected write: ' + guardErr.message);
    return false;
  }

// Write to outbox using mandatory lease + atomic write
  const writeResult = await atomicWriteWithLease(outboxPath, finalMsg, 'swarmmind', 30000);
  console.log('[build-message] Written to outbox: ' + writeResult.path);

  if (send) {
    // Deliver to target lane's canonical inbox
    var targetPath = CANONICAL_INBOX_PATHS[msg.to];
    if (!targetPath) {
      console.error('[build-message] No canonical path for lane: ' + msg.to);
      return false;
    }

    var inboxPath = path.join(targetPath, filename);
    try {
      const targetLane = msg.to || 'archivist';
      await atomicWriteWithLease(inboxPath, finalMsg, targetLane, 30000);
      console.log('[build-message] Delivered to: ' + inboxPath);
    } catch (e) {
      console.error('[build-message] Delivery failed: ' + e.message);
      return false;
    }
  }

  return true;
}

// CLI interface
if (require.main === module) {
  var args = process.argv.slice(2);
  var options = {};

  for (var i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      var key = args[i].slice(2).replace(/-([a-z])/g, function(_, c) { return c.toUpperCase(); });
      options[key] = args[i + 1] || 'true';
      i++;
    }
  }

  if (!options.to || !options.type || !options.priority || !options.subject || !options.taskId) {
    console.error('Usage: node build-message.js --from swarmmind --to kernel --type ack --priority P1 --subject "Subject" --task-id "task-001" [--body "Body"] [--send]');
    console.error('');
    console.error('Required: --to, --type, --priority, --subject, --task-id');
    console.error('Optional: --from (default: swarmmind), --body, --send (also deliver to target inbox)');
    process.exit(1);
  }

async function main(options) {
  var msg = buildMessage(options);
  var sent = await deliverMessage(msg, options.send === 'true');

  // Show the message (after signing attempt in deliverMessage)
  // Re-read the outbox version to get the signed copy
  if (!options.send) {
    var outboxFile = path.join(OUTBOX_DIR, msg.id + '.json');
    if (fs.existsSync(outboxFile)) {
      var outboxMsg = JSON.parse(fs.readFileSync(outboxFile, 'utf8'));
      console.log(JSON.stringify(outboxMsg, null, 2));
    } else {
      console.log(JSON.stringify(msg, null, 2));
    }
  }

  // Validate the built message with InboxMessageSchema
  var InboxMessageSchema = require('../src/attestation/InboxMessageSchema').InboxMessageSchema;
  var schema = new InboxMessageSchema();
  var result = schema.validate(msg);
  console.log('\n[validation] valid=' + result.valid + ' depth=' + result.depth + ' errors=' + result.errors.length + ' warnings=' + result.warnings.length);
  if (result.errors.length > 0) console.error('[validation] Errors:', result.errors);
  if (result.warnings.length > 0) console.warn('[validation] Warnings:', result.warnings);

  return sent;
}

main(options).then(function(sent) {
  if (!sent) {
    process.exit(1);
  }
}).catch(function(e) {
  console.error('[build-message] FATAL:', e.message);
  process.exit(1);
});
  }

  // Validate the built message with InboxMessageSchema
  var InboxMessageSchema = require('../src/attestation/InboxMessageSchema').InboxMessageSchema;
  var schema = new InboxMessageSchema();
  var result = schema.validate(msg);
  console.log('\n[validation] valid=' + result.valid + ' depth=' + result.depth + ' errors=' + result.errors.length + ' warnings=' + result.warnings.length);
  if (result.errors.length > 0) console.error('[validation] Errors:', result.errors);
  if (result.warnings.length > 0) console.warn('[validation] Warnings:', result.warnings);

  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

module.exports = { buildMessage, deliverMessage, writeWithLease };

