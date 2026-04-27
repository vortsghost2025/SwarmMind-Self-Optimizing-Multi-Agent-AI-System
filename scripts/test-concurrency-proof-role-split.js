#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { LaneWorker, createDefaultConfig } = require('./lane-worker');
const { createSignedMessage } = require('./create-signed-message');

const REPO_ROOT = path.resolve(__dirname, '..');
const LANE = 'swarmmind';

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function resetQueues(cfg) {
  const dirs = [
    cfg.queues.inbox,
    cfg.queues.actionRequired,
    cfg.queues.inProgress,
    cfg.queues.processed,
    cfg.queues.blocked,
    cfg.queues.quarantine,
  ];
  for (const d of dirs) {
    ensureDir(d);
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.json'))) {
      fs.unlinkSync(path.join(d, f));
    }
  }
}

function main() {
  const cfg = createDefaultConfig(REPO_ROOT, LANE);
  resetQueues(cfg);

  const outboxDir = path.join(REPO_ROOT, 'lanes', LANE, 'outbox');
  ensureDir(outboxDir);
  const artifact = path.join(outboxDir, 'concurrency-proof-artifact.json');
  fs.writeFileSync(artifact, JSON.stringify({ ok: true, kind: 'execution-artifact' }), 'utf8');

  const now = new Date();
  const msg = {
    schema_version: '1.3',
    task_id: 'concurrency-proof-role-split-1',
    idempotency_key: 'concurrency-proof-role-split-1',
    from: 'swarmmind',
    to: 'archivist',
    type: 'response',
    task_kind: 'report',
    priority: 'P1',
    subject: 'concurrency proof response',
    body: 'execution completed before verifier hash changed',
    timestamp: now.toISOString(),
    dispatch_timestamp: new Date(now.getTime() - 60_000).toISOString(),
    execution_timestamp: now.toISOString(),
    requires_action: false,
    payload: { mode: 'inline', compression: 'none' },
    execution: { mode: 'auto', engine: 'pipeline', actor: 'task-executor' },
    lease: { owner: 'swarmmind', acquired_at: now.toISOString() },
    retry: { attempt: 1, max_attempts: 1 },
    evidence: { required: true, verified: true },
    evidence_exchange: {
      artifact_path: artifact,
      artifact_type: 'response',
      delivered_at: now.toISOString(),
    },
    heartbeat: {
      status: 'done',
      last_heartbeat_at: now.toISOString(),
      interval_seconds: 300,
      timeout_seconds: 900,
    },
    _governance: {
      code_version_hash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    },
  };

  const signed = createSignedMessage(msg, 'swarmmind');
  fs.writeFileSync(path.join(cfg.queues.inbox, 'concurrency-proof-role-split-1.json'), JSON.stringify(signed, null, 2), 'utf8');

  const worker = new LaneWorker({ repoRoot: REPO_ROOT, lane: LANE, dryRun: false });
  const summary = worker.processOnce();
  assert.strictEqual(summary.routed.processed, 1, 'Expected processed route for post-execution invalid domain');
  assert.strictEqual(summary.routed.blocked, 0, 'Should preserve execution, not block');

  const processedFiles = fs.readdirSync(cfg.queues.processed).filter((f) => f.endsWith('.json'));
  assert.strictEqual(processedFiles.length, 1, 'Expected one processed output');
  const routed = JSON.parse(fs.readFileSync(path.join(cfg.queues.processed, processedFiles[0]), 'utf8'));
  const lw = routed._lane_worker || {};
  assert.strictEqual(lw.reason, 'INVALID_DOMAIN_POST_EXECUTION');
  assert.strictEqual(lw.verification_outcome, 'INVALID_DOMAIN');
  assert.strictEqual(lw.domain_gate_executed, true);
  assert.ok(lw.domain_validation && lw.domain_validation.semantic);
  assert.strictEqual(lw.domain_validation.semantic.code_version_hash_valid, false);

  console.log('concurrency-proof-role-split: PASS (code hash drift => INVALID_DOMAIN_POST_EXECUTION, never PASS)');
}

if (require.main === module) main();

