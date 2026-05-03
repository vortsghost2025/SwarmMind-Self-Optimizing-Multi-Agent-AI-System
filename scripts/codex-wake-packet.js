#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getLane } = require('./util/lane-discovery');

const LANE = 'swarmmind';
const ROOT = getLane('swarmmind').root;
const INBOX = path.join(ROOT, 'lanes', LANE, 'inbox');
const ACTION_REQUIRED = path.join(INBOX, 'action-required');
const STATE_DIR = path.join(ROOT, 'lanes', LANE, 'state');
const WAKE_PATH = path.join(STATE_DIR, 'codex-wake-packet.json');
const ARCHIVIST_SIGNAL_DIR = path.join(getLane('archivist').root, 'lanes', 'archivist', 'inbox');

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return null;
  }
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json') && !name.toLowerCase().startsWith('heartbeat'))
    .map((name) => path.join(dir, name));
}

function needsCodex(msg) {
  const text = `${msg.subject || ''}\n${msg.body || ''}`.toLowerCase();
  if (msg.requires_action !== true) return false;
  return [
    'audit',
    'review',
    'patch',
    'implement',
    'fix',
    'debug',
    'test',
    'strict',
    'codex',
    'subagent',
  ].some((token) => text.includes(token));
}

function summarize(filePath, queue) {
  const msg = safeReadJson(filePath);
  if (!msg) {
    return {
      file: filePath,
      queue,
      readable: false,
      priority: 'P2',
      subject: path.basename(filePath),
      requires_codex: true,
    };
  }
  return {
    file: filePath,
    queue,
    readable: true,
    task_id: msg.task_id || msg.id || path.basename(filePath, '.json'),
    from: msg.from || null,
    to: msg.to || null,
    priority: msg.priority || 'P2',
    type: msg.type || null,
    task_kind: msg.task_kind || null,
    subject: msg.subject || '',
    requires_action: msg.requires_action === true,
    requires_codex: needsCodex(msg),
    timestamp: msg.timestamp || null,
  };
}

function buildPacket() {
  const candidates = [
    ...listJson(INBOX).map((p) => summarize(p, 'inbox')),
    ...listJson(ACTION_REQUIRED).map((p) => summarize(p, 'action-required')),
  ];
  const pending = candidates
    .filter((item) => item.requires_codex || item.queue === 'action-required')
    .sort((a, b) => {
      const rank = { P0: 0, P1: 1, P2: 2, P3: 3 };
      return (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2);
    });
  const packet = {
    schema_version: '1.0',
    lane: LANE,
    generated_at: nowIso(),
    pending_count: pending.length,
    pending,
    instructions: [
      'Open this file when activating Codex as SwarmMind.',
      'Process pending items in priority order.',
      'Send signed response to Archivist inbox with convergence_gate.',
      'Move completed SwarmMind inbox items to processed.',
    ],
  };
  const hash = crypto.createHash('sha256')
    .update(JSON.stringify({ pending: packet.pending, instructions: packet.instructions }))
    .digest('hex');
  packet.packet_hash = hash;
  return packet;
}

function writePacket(packet) {
  ensureDir(STATE_DIR);
  fs.writeFileSync(WAKE_PATH, JSON.stringify(packet, null, 2) + '\n', 'utf8');
}

function writeArchivistSignal(packet) {
  if (packet.pending_count === 0) return null;
  ensureDir(ARCHIVIST_SIGNAL_DIR);
  const signal = {
    schema_version: '1.3',
    task_id: 'swarmmind-codex-wake-pending',
    idempotency_key: `swarmmind-codex-wake-${packet.packet_hash.slice(0, 16)}`,
    from: 'swarmmind',
    to: 'archivist',
    type: 'status',
    task_kind: 'status',
    priority: packet.pending.some((p) => p.priority === 'P0' || p.priority === 'P1') ? 'P1' : 'P2',
    subject: `SwarmMind Codex wake packet pending: ${packet.pending_count}`,
    body: `SwarmMind has ${packet.pending_count} item(s) requiring Codex/subagent attention. Wake packet: ${WAKE_PATH}`,
    timestamp: packet.generated_at,
    requires_action: false,
    payload: { mode: 'inline', compression: 'none' },
    execution: { mode: 'automatic', engine: 'codex-wake-packet', actor: 'lane' },
    lease: { owner: 'swarmmind', acquired_at: packet.generated_at },
    retry: { attempt: 1, max_attempts: 1 },
    evidence: { required: true, evidence_path: WAKE_PATH, verified: true, verified_by: 'swarmmind', verified_at: packet.generated_at },
    evidence_exchange: { artifact_path: WAKE_PATH, artifact_type: 'report', delivered_at: packet.generated_at },
    heartbeat: { status: 'done', last_heartbeat_at: packet.generated_at, interval_seconds: 300, timeout_seconds: 900 },
    convergence_gate: {
      claim: 'SwarmMind Codex-required work has been surfaced while Codex is inactive.',
      evidence: WAKE_PATH,
      verified_by: 'swarmmind',
      contradictions: [],
      status: 'proven',
    },
  };
  const signalPath = path.join(ARCHIVIST_SIGNAL_DIR, 'swarmmind-codex-wake-pending.json');
  fs.writeFileSync(signalPath, JSON.stringify(signal, null, 2) + '\n', 'utf8');
  return signalPath;
}

function main() {
  const apply = process.argv.includes('--apply');
  const packet = buildPacket();
  if (apply) writePacket(packet);
  const signalPath = apply ? writeArchivistSignal(packet) : null;
  console.log(JSON.stringify({
    dry_run: !apply,
    wake_packet: WAKE_PATH,
    archivist_signal: signalPath,
    pending_count: packet.pending_count,
    pending: packet.pending,
  }, null, 2));
}

main();
