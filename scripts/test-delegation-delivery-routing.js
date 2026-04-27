#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const { createSignedMessage } = require('./create-signed-message');

const REPO_ROOT = path.resolve(__dirname, '..');
const SWARM_ACTION_REQUIRED = path.join(REPO_ROOT, 'lanes', 'swarmmind', 'inbox', 'action-required');
const SWARM_INBOX = path.join(REPO_ROOT, 'lanes', 'swarmmind', 'inbox');
const ARCHIVIST_INBOX = 'S:/Archivist-Agent/lanes/archivist/inbox';
const LIBRARY_INBOX = 'S:/self-organizing-library/lanes/library/inbox';

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function writeTask(taskId, fromLane, body) {
  const msg = {
    schema_version: '1.3',
    task_id: taskId,
    idempotency_key: taskId,
    from: fromLane,
    to: 'swarmmind',
    type: 'task',
    task_kind: 'proposal',
    priority: 'P2',
    subject: `routing test ${taskId}`,
    body,
    timestamp: new Date().toISOString(),
    requires_action: true,
    payload: { mode: 'inline', compression: 'none' },
    execution: { mode: 'manual', engine: 'opencode', actor: 'lane' },
    lease: { owner: 'swarmmind', acquired_at: new Date().toISOString() },
    retry: { attempt: 1, max_attempts: 1 },
    evidence: { required: false, verified: false },
    evidence_exchange: {},
    heartbeat: {
      status: 'pending',
      last_heartbeat_at: new Date().toISOString(),
      interval_seconds: 300,
      timeout_seconds: 900,
    },
  };
  const signed = createSignedMessage(msg, fromLane);
  ensureDir(SWARM_ACTION_REQUIRED);
  const p = path.join(SWARM_ACTION_REQUIRED, `${taskId}.json`);
  fs.writeFileSync(p, JSON.stringify(signed, null, 2), 'utf8');
  return p;
}

function runExecutor(localLoop) {
  const env = { ...process.env };
  if (localLoop) env.SWARM_ROLE_LOCAL_LOOP = '1';
  else delete env.SWARM_ROLE_LOCAL_LOOP;
  const res = spawnSync('node', ['scripts/task-executor.js', '--apply'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env,
  });
  assert.strictEqual(res.status, 0, `task-executor failed: ${res.stderr || res.stdout}`);
}

function readResponseFrom(inboxPath, taskId) {
  const p = path.join(inboxPath, `response-${taskId}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function cleanupResponse(inboxPath, taskId) {
  const p = path.join(inboxPath, `response-${taskId}.json`);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function testArchivistDelivery() {
  const id = `routing-arch-${Date.now()}`;
  writeTask(id, 'archivist', 'status');
  runExecutor(false);
  const resp = readResponseFrom(ARCHIVIST_INBOX, id);
  assert(resp, 'Archivist response not delivered to Archivist inbox');
  assert.strictEqual(resp.to, 'archivist');
  cleanupResponse(ARCHIVIST_INBOX, id);
}

function testLibraryDelivery() {
  const id = `routing-lib-${Date.now()}`;
  writeTask(id, 'library', 'hash file scripts/lane-worker.js');
  runExecutor(false);
  const resp = readResponseFrom(LIBRARY_INBOX, id);
  assert(resp, 'Library response not delivered to Library inbox');
  assert.strictEqual(resp.to, 'library');
  cleanupResponse(LIBRARY_INBOX, id);
}

function testLocalLoop() {
  const id = `routing-loop-${Date.now()}`;
  writeTask(id, 'archivist', 'status');
  runExecutor(true);
  const local = readResponseFrom(SWARM_INBOX, id);
  assert(local, 'Local-loop response not delivered to Swarm local inbox');
  assert.strictEqual(local.to, 'archivist');
  const remote = readResponseFrom(ARCHIVIST_INBOX, id);
  assert.strictEqual(remote, null, 'Local-loop should not deliver to Archivist inbox');
  cleanupResponse(SWARM_INBOX, id);
}

function main() {
  testArchivistDelivery();
  testLibraryDelivery();
  testLocalLoop();
  console.log('delegation-delivery-routing: PASS');
}

if (require.main === module) main();

