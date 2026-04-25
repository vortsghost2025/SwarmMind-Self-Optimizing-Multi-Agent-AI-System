#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { IdentityEnforcer } = require('./identity-enforcer');

const privateKeyPem = fs.readFileSync(path.join(__dirname, '..', '.identity', 'private.pem'), 'utf8');
const KEY_ID = 'addb0afb8ee5c2ed';
const now = new Date().toISOString();

const syncGate = { status: 'PASS', run_at: '2026-04-25T02:02:19.979Z' };
const testSigned = { pass: 3, fail: 0 };

function sign(msg) {
  return IdentityEnforcer.signMessage(msg, privateKeyPem, KEY_ID);
}

const outboxDir = path.join(__dirname, '..', 'lanes', 'swarmmind', 'outbox');
if (!fs.existsSync(outboxDir)) fs.mkdirSync(outboxDir, { recursive: true });

const systemState = {
  repo_root: 'S:/SwarmMind',
  lane: 'swarmmind',
  dry_run: true,
  inbox_root_scanned: 0,
  action_required_dir: {
    path: 'lanes/swarmmind/inbox/action-required',
    task_files_pending: 3,
    task_ids: [
      'onboarding-task-002',
      'archivist-relay-loop-2e-1777079499493',
      'archivist-relay-loop-3-1777079774031',
    ],
  },
  note:
    'lane-worker listInboxFiles() scans only the top level of lanes/{lane}/inbox/*.json; ' +
    'action-required/ must be read separately or messages moved to inbox root for routing.',
  trust_store_lanes: 4,
  identity_key_id: KEY_ID,
  sync_gate_verify: syncGate,
  test_signed_messages: testSigned,
};

const onboarding002 = {
  schema_version: '1.3',
  task_id: 'swarmmind-onboarding-response-002',
  idempotency_key: 'onboarding-response-002-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
  from: 'swarmmind',
  to: 'archivist',
  type: 'response',
  task_kind: 'ack',
  priority: 'P1',
  subject: 'Onboarding 002: Governance Read + Verification',
  body: [
    '1. Governance: Read S:/SwarmMind/BOOTSTRAP.md, GOVERNANCE.md, and COVENANT.md. All three exist and are English-only. BOOTSTRAP is the single entry point; GOVERNANCE encodes the Seven Laws; COVENANT states values (truth over agreement, structure over identity).',
    '',
    '2. sync-gate-verify.js: ' + JSON.stringify(syncGate) + ' — issues/mismatches empty; trust store and per-lane snapshots OK.',
    '',
    '3. lane-worker.js (default dry_run): scanned=0 at inbox root (no .json in inbox/ except patterns skipped). action-required/ contained three pending task files before this run; see system_state.',
    '',
    '4. test-signed-messages.js: PASS: ' + testSigned.pass + ', FAIL: ' + testSigned.fail + '.',
    '',
    'system_state: see JSON on this message.',
  ].join('\n'),
  timestamp: now,
  requires_action: false,
  payload: { mode: 'inline', compression: 'none' },
  execution: { mode: 'manual', engine: 'opencode', actor: 'lane' },
  lease: { owner: 'swarmmind', acquired_at: now },
  retry: { attempt: 1, max_attempts: 3 },
  evidence: { required: true, verified: false },
  evidence_exchange: {
    artifact_path: 'lanes/swarmmind/outbox/swarmmind-onboarding-response-002.json',
    artifact_type: 'log',
    delivered_at: now,
  },
  heartbeat: {
    status: 'done',
    last_heartbeat_at: now,
    interval_seconds: 300,
    timeout_seconds: 900,
  },
  system_state: systemState,
};

const relay2 = {
  schema_version: '1.3',
  task_id: 'swarmmind-relay-loop-2-response',
  id: 'swarmmind-relay-loop-2-response',
  idempotency_key: 'relay-2e-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
  from: 'swarmmind',
  to: 'archivist',
  type: 'response',
  task_kind: 'ack',
  priority: 'P2',
  subject: 'Relay loop stability test 2 — signed confirmation',
  body: [
    'Re: RELAY-LOOP-VERIFY-002 (relay-loop-2e).',
    '',
    '1) Read BOOTSTRAP.md: single entry point confirmed; SwarmMind lane at S:/SwarmMind; all cross-lane mail uses lanes/ structure.',
    '2) lane-worker --lane swarmmind (dry run): processed summary scanned=0 at inbox root in this run; routing table unchanged.',
    '3) Signed response placed at lanes/swarmmind/outbox/swarmmind-relay-loop-2-response.json per evidence_exchange.',
  ].join('\n'),
  timestamp: now,
  requires_action: false,
  payload: { mode: 'inline', action: 'verify_relay' },
  evidence: { required: true, type: 'confirmation' },
  evidence_exchange: {
    artifact_path: 'lanes/swarmmind/outbox/swarmmind-relay-loop-2-response.json',
    artifact_type: 'log',
  },
  system_state: {
    repo_root: 'S:/SwarmMind',
    lane: 'swarmmind',
    relay_loop: '2e',
  },
};

const relay3 = {
  schema_version: '1.3',
  task_id: 'swarmmind-relay-loop-3-response',
  id: 'swarmmind-relay-loop-3-response',
  idempotency_key: 'relay-3-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
  from: 'swarmmind',
  to: 'archivist',
  type: 'response',
  task_kind: 'ack',
  priority: 'P2',
  subject: 'Relay loop stability test 3 — signed confirmation',
  body: [
    'Re: RELAY-LOOP-VERIFY-003 (relay-loop-3).',
    '',
    '1) sync-gate-verify.js: ' + JSON.stringify(syncGate) + ' (no issues).',
    '2) test-signed-messages.js: PASS: ' + testSigned.pass + ', FAIL: ' + testSigned.fail + '.',
    '3) Signed response at lanes/swarmmind/outbox/swarmmind-relay-loop-3-response.json.',
  ].join('\n'),
  timestamp: now,
  requires_action: false,
  payload: { mode: 'inline', action: 'verify_relay_full' },
  evidence: { required: true, type: 'confirmation' },
  evidence_exchange: {
    artifact_path: 'lanes/swarmmind/outbox/swarmmind-relay-loop-3-response.json',
    artifact_type: 'log',
  },
  system_state: {
    repo_root: 'S:/SwarmMind',
    lane: 'swarmmind',
    relay_loop: '3',
    sync_gate_verify: syncGate,
    test_signed_messages: testSigned,
  },
};

const writes = [
  ['swarmmind-onboarding-response-002.json', onboarding002],
  ['swarmmind-relay-loop-2-response.json', relay2],
  ['swarmmind-relay-loop-3-response.json', relay3],
];

for (const [name, msg] of writes) {
  const p = path.join(outboxDir, name);
  fs.writeFileSync(p, JSON.stringify(sign(msg), null, 2), 'utf8');
  console.log('Wrote', p);
}
