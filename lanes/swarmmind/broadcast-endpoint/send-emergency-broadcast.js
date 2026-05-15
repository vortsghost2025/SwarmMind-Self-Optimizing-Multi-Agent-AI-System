#!/usr/bin/env node
/**
 * Emergency Broadcast Sender - SwarmMind
 *
 * Sends a P0 emergency alert broadcast to all 4 lanes.
 * Creates properly signed messages following broadcast-message-v1 schema.
 *
 * Usage: node broadcast-endpoint/send-emergency-broadcast.js [options]
 *   --subject "Emergency Subject"
 *   --body "Message body..."
 *   --broadcast-id "unique-id"
 *   --test  (send test message)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LANE_ID = 'swarmmind';
const LANE_ROOT = 'S:/SwarmMind';

// Canonical inbox paths from lane-registry.json
const CANONICAL_INBOXES = {
  archivist: 'S:/Archivist-Agent/lanes/archivist/inbox/',
  kernel:    'S:/kernel-lane/lanes/kernel/inbox/',
  library:   'S:/self-organizing-library/lanes/library/inbox/',
  swarmmind: 'S:/SwarmMind/lanes/swarmmind/inbox/'
};

const OUTBOX_DIR = path.join(LANE_ROOT, 'lanes', LANE_ID, 'outbox');
const BROADCAST_LOG = path.join(LANE_ROOT, 'lanes', LANE_ID, 'broadcast-endpoint', 'broadcast-sent.log');

function nowIso() { return new Date().toISOString(); }
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function log(msg) {
  const ts = nowIso();
  fs.appendFileSync(BROADCAST_LOG, `[${ts}] ${msg}\n`, 'utf8');
  console.log(`[broadcast-sender] ${msg}`);
}

function parseArgs(argv) {
  const out = { subject: '', body: '', broadcastId: null, test: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--subject' && argv[i+1]) { out.subject = argv[i+1]; i++; continue; }
    if (a === '--body' && argv[i+1]) { out.body = argv[i+1]; i++; continue; }
    if (a === '--broadcast-id' && argv[i+1]) { out.broadcastId = argv[i+1]; i++; continue; }
    if (a === '--test') { out.test = true; continue; }
  }
  return out;
}

function generateBroadcastId() {
  const ts = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  return `broadcast-${ts}-${rand}`;
}

function buildBroadcastMessage(options) {
  const {
    subject = '',
    body = '',
    broadcastId = null,
    targetLanes = ['archivist', 'kernel', 'library', 'swarmmind']
  } = options;

  const ts = nowIso();
  const resolvedBroadcastId = broadcastId || generateBroadcastId();
  const taskId = `broadcast-${Date.now()}-${crypto.randomBytes(4).toString('hex').slice(0, 8)}`;
  const idempotencyKey = `${resolvedBroadcastId}-${LANE_ID}-outbound`;

  return {
    schema_version: '1.3',
    task_id: taskId,
    idempotency_key: idempotencyKey,
    from: LANE_ID,
    to: 'broadcast',
    type: 'alert',
    task_kind: 'alert',
    priority: 'P0',
    subject: subject || '[EMERGENCY BROADCAST] System-Wide Alert',
    body: body || 'This is an emergency broadcast from SwarmMind. Immediate attention required across all lanes.',
    timestamp: ts,
    requires_action: true,
    payload: {
      mode: 'inline',
      compression: 'none',
      chunk: null
    },
    execution: {
      mode: 'manual',
      engine: 'kilo',
      actor: 'lane'
    },
    lease: {
      owner: 'broadcast',
      acquired_at: ts,
      expires_at: new Date(Date.now() + 300000).toISOString(), // 5 min
      renewal_count: 0,
      max_renewals: 1
    },
    retry: {
      attempt: 1,
      max_attempts: 3
    },
    evidence: {
      required: false,
      verified: false
    },
    evidence_exchange: {
      artifact_path: `lanes/${LANE_ID}/broadcast-endpoint/broadcast-sent.log`,
      artifact_type: 'log',
      delivered_at: ts
    },
    heartbeat: {
      status: 'done',
      last_heartbeat_at: ts,
      interval_seconds: 300,
      timeout_seconds: 900
    },
    confidence: 9,
    broadcast_metadata: {
      broadcast_id: resolvedBroadcastId,
      originator: LANE_ID,
      transmitted_at: ts,
      target_lanes: targetLanes,
      requires_ack: true,
      response_deadline: new Date(Date.now() + 300000).toISOString() // 5 min default
    }
  };
}

function signMessage(msg, laneId) {
  const createSignedMessagePath = path.join(LANE_ROOT, 'scripts', 'create-signed-message.js');
  const { createSignedMessage: sign } = require(createSignedMessagePath);
  return sign(msg, laneId);
}

function deliverToLanes(signedBroadcast, targetLanes) {
  const results = [];
  const sentAt = nowIso();

  for (const lane of targetLanes) {
    const inboxPath = CANONICAL_INBOXES[lane];
    if (!inboxPath) {
      log(`WARNING: Unknown lane: ${lane}`);
      results.push({ lane, status: 'error', error: 'Unknown lane' });
      continue;
    }

    try {
      ensureDir(inboxPath);
      const fileName = `${signedBroadcast.task_id}.json`;
      const filePath = path.join(inboxPath, fileName);

      fs.writeFileSync(filePath, JSON.stringify(signedBroadcast, null, 2), 'utf8');
      log(`Delivered to ${lane}: ${fileName}`);
      results.push({ lane, status: 'delivered', file: fileName, path: filePath });

    } catch (err) {
      log(`ERROR delivering to ${lane}: ${err.message}`);
      results.push({ lane, status: 'error', error: err.message });
    }
  }

  // Record broadcast in sent log
  recordBroadcastSent(signedBroadcast, results, sentAt);

  return results;
}

function recordBroadcastSent(msg, deliveryResults, sentAt) {
  const record = {
    sent_at: sentAt,
    broadcast_id: msg.broadcast_metadata.broadcast_id,
    task_id: msg.task_id,
    subject: msg.subject,
    target_lanes: msg.broadcast_metadata.target_lanes,
    delivery_results: deliveryResults
  };

  ensureDir(path.join(LANE_ROOT, 'lanes', LANE_ID, 'broadcast-endpoint'));
  const logPath = path.join(LANE_ROOT, 'lanes', LANE_ID, 'broadcast-endpoint', 'broadcasts-sent.json');

  let history = [];
  if (fs.existsSync(logPath)) {
    try { history = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch (_) {}
  }
  history.push(record);
  fs.writeFileSync(logPath, JSON.stringify(history, null, 2), 'utf8');

  log(`Recorded broadcast: ${msg.broadcast_metadata.broadcast_id}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  ensureDir(OUTBOX_DIR);
  ensureDir(path.join(LANE_ROOT, 'lanes', LANE_ID, 'broadcast-endpoint'));

  log(`=== Emergency Broadcast Sender [${LANE_ID}] ===`);

  if (args.test) {
    log('TEST MODE: Sending test emergency broadcast');
    args.subject = '[TEST] Emergency Broadcast Test';
    args.body = 'This is a TEST emergency broadcast from SwarmMind. All lanes should acknowledge receipt. Timestamp: ' + nowIso();
  }

  if (!args.subject || !args.body) {
    console.error('ERROR: --subject and --body are required (or use --test)');
    process.exit(1);
  }

  log(`Preparing broadcast: "${args.subject}"`);

  // Build the broadcast message
  const broadcastMsg = buildBroadcastMessage({
    subject: args.subject,
    body: args.body,
    broadcastId: args.broadcastId,
    targetLanes: ['archivist', 'kernel', 'library', 'swarmmind']
  });

  log(`Broadcast ID: ${broadcastMsg.broadcast_metadata.broadcast_id}`);
  log(`Target lanes: ${broadcastMsg.broadcast_metadata.target_lanes.join(', ')}`);

  // Sign the broadcast
  try {
    const signedBroadcast = signMessage(broadcastMsg, LANE_ID);
    log(`Signed with SwarmMind key (key_id: ${signedBroadcast.key_id})`);

    // Deliver to all lanes
    const results = deliverToLanes(signedBroadcast, ['archivist', 'kernel', 'library', 'swarmmind']);

    const deliveredCount = results.filter(r => r.status === 'delivered').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    log(`=== Broadcast Complete ===`);
    log(`Delivered: ${deliveredCount}/4 lanes`);
    log(`Errors: ${errorCount}`);

    // Also write to own outbox for record
    const outboxRecord = {
      ...signedBroadcast,
      delivery_results: results,
      delivered_at: nowIso()
    };
    const outboxFile = `${signedBroadcast.task_id}.json`;
    fs.writeFileSync(path.join(OUTBOX_DIR, outboxFile), JSON.stringify(outboxRecord, null, 2), 'utf8');
    log(`Recorded in outbox: ${outboxFile}`);

    // Print summary
    console.log('\n=== EMERGENCY BROADCAST SUMMARY ===');
    console.log(`Broadcast ID: ${broadcastMsg.broadcast_metadata.broadcast_id}`);
    console.log(`From: ${LANE_ID}`);
    console.log(`Subject: ${args.subject}`);
    console.log(`Priority: P0`);
    console.log(`Type: alert`);
    console.log(`Targets: ${broadcastMsg.broadcast_metadata.target_lanes.join(', ')}`);
    console.log(`Delivery Status:`);
    for (const r of results) {
      const icon = r.status === 'delivered' ? '✅' : '❌';
      console.log(`  ${icon} ${r.lane}: ${r.status}${r.error ? ` - ${r.error}` : ''}`);
    }
    console.log(`===============================\n`);

    process.exit(errorCount > 0 ? 1 : 0);

  } catch (err) {
    log(`FATAL: ${err.message}`);
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
