#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load IdentityEnforcer for its signMessage method and stableStringify dependency
const { IdentityEnforcer } = require('./identity-enforcer');
const { getRoots, sToLocal, LANES: _DL } = require('./util/lane-discovery');


// Load private key
const privateKeyPath = path.join(__dirname, '..', '.identity', 'private.pem');
const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');

// Current timestamp
const now = new Date().toISOString();

// Construct the response message according to inbox-message v1.3 schema
const message = {
  schema_version: '1.3',
  task_id: 'swarmmind-onboarding-response-001',
  idempotency_key: 'onboarding-response-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
  from: 'swarmmind',
  to: 'archivist',
  type: 'response',
  task_kind: 'ack',
  priority: 'P1',
  subject: 'Onboarding Verification Complete',
  body: `Onboarding verification completed. Findings:

1. Governance constraints: Files GOVERNANCE.md, COVENANT.md, and BOOTSTRAP.md were not found at S:/SwarmMind/ or S:/. Operational constraints are enforced via system code and configuration: evidence requirement, non-ASCII rejection, signature verification (RS256), completion proof checks, read-only allowed roots, and blocked roots. Trust store holds public keys for 4 lanes.

2. sync-gate-verify.js: Script not found at S:/SwarmMind/scripts/sync-gate-verify.js. Could not execute.

3. lane-worker dry-run: Inbox state - 1 message scanned (the onboarding task itself). Routed to quarantine due to non-ASCII content violation (FORMAT_VIOLATION_NON-ASCII). Signature valid. No messages in action_required, in_progress, processed, blocked.

4. test-signed-messages.js: PASS: 3, FAIL: 0. All signature integration tests passed.

System state:
- repo_root: S:/SwarmMind
- lane: swarmmind
- dry_run: true
- scanned: 1
- routed: { action_required: 0, in_progress: 0, processed: 0, blocked: 0, quarantine: 1 }
- trust_store_lanes: 4
- identity_key_id: addb0afb8ee5c2ed
- read_only_mode: true
- allowed_roots: ["S:/workspace","S:/projects"]
- blocked_roots: ["C:/Windows","C:/Program Files","C:/Users/Sean/AppData"]`,
  timestamp: now,
  requires_action: false,
  payload: {
    mode: 'inline',
    compression: 'none'
  },
  execution: {
    mode: 'manual',
    engine: 'opencode',
    actor: 'lane'
  },
  lease: {
    owner: 'swarmmind',
    acquired_at: now
  },
  retry: {
    attempt: 1,
    max_attempts: 3
  },
  evidence: {
    required: true,
    verified: false
  },
  evidence_exchange: {
    artifact_path: 'lanes/swarmmind/outbox/swarmmind-onboarding-response-001.json',
    artifact_type: 'log',
    delivered_at: now
  },
  heartbeat: {
    status: 'done',
    last_heartbeat_at: now,
    interval_seconds: 300,
    timeout_seconds: 900
  },
  system_state: {
    repo_root: getRoots()['swarmmind'],
    lane: 'swarmmind',
    dry_run: true,
    scanned: 1,
    routed: { action_required: 0, in_progress: 0, processed: 0, blocked: 0, quarantine: 1 },
    trust_store_lanes: 4,
    identity_key_id: 'addb0afb8ee5c2ed',
    read_only_mode: true,
    allowed_roots: ['S:/workspace', 'S:/projects'],
    blocked_roots: ['C:/Windows', 'C:/Program Files', 'C:/Users/Sean/AppData']
  }
};

// Sign the message using the same method as IdentityEnforcer
const signedMessage = IdentityEnforcer.signMessage(message, privateKeyPem, 'addb0afb8ee5c2ed');

// Ensure outbox directory exists
const outboxDir = path.join(__dirname, '..', 'lanes', 'swarmmind', 'outbox');
if (!fs.existsSync(outboxDir)) {
  fs.mkdirSync(outboxDir, { recursive: true });
}

// Write to outbox
const outboxPath = path.join(outboxDir, 'swarmmind-onboarding-response-001.json');
fs.writeFileSync(outboxPath, JSON.stringify(signedMessage, null, 2), 'utf8');

console.log('Signed onboarding response written to:', outboxPath);
console.log('Signature key ID:', signedMessage.key_id);
console.log('Message ID:', signedMessage.id || signedMessage.task_id);
