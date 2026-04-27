#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const LANE = 'swarmmind';
const PROCESSED_DIR = path.join(REPO_ROOT, 'lanes', LANE, 'inbox', 'processed');
const BLOCKED_DIR = path.join(REPO_ROOT, 'lanes', LANE, 'inbox', 'blocked');
const QUARANTINE_DIR = path.join(REPO_ROOT, 'lanes', LANE, 'inbox', 'quarantine');
const INBOX_DIR = path.join(REPO_ROOT, 'lanes', LANE, 'inbox');

function parseArgs(argv) {
  const out = { role: 'all', apply: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--role' && argv[i + 1]) {
      out.role = String(argv[i + 1]).toLowerCase();
      i += 1;
      continue;
    }
    if (a === '--apply') out.apply = true;
    if (a === '--json') out.json = true;
  }
  return out;
}

function runNode(scriptName, args = []) {
  const scriptPath = path.join(REPO_ROOT, 'scripts', scriptName);
  const result = spawnSync('node', [scriptPath, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, SWARM_ROLE_LOCAL_LOOP: '1' },
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function countJson(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).length;
}

function runGovernance(apply) {
  ensureDir(INBOX_DIR);
  ensureDir(PROCESSED_DIR);
  ensureDir(BLOCKED_DIR);
  ensureDir(QUARANTINE_DIR);
  const args = ['--lane', LANE, '--json'];
  if (apply) args.push('--apply');
  return { role: 'governance', tool: 'lane-worker.js', ...runNode('lane-worker.js', args) };
}

function runExecution(apply) {
  const args = [];
  if (apply) args.push('--apply');
  return { role: 'execution', tool: 'task-executor.js', ...runNode('task-executor.js', args) };
}

function runVerification() {
  const processed = countJson(PROCESSED_DIR);
  const blocked = countJson(BLOCKED_DIR);
  const quarantine = countJson(QUARANTINE_DIR);
  return {
    role: 'verification',
    ok: true,
    status: 0,
    summary: {
      lane: LANE,
      processed,
      blocked,
      quarantine,
      truth_posture: blocked > 0 ? 'attention-required' : 'stable',
      timestamp: new Date().toISOString(),
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const valid = new Set(['governance', 'execution', 'verification', 'all']);
  if (!valid.has(args.role)) {
    console.error(`Invalid --role "${args.role}". Valid: governance|execution|verification|all`);
    process.exit(1);
  }

  const results = [];
  if (args.role === 'governance' || args.role === 'all') results.push(runGovernance(args.apply));
  if (args.role === 'execution' || args.role === 'all') results.push(runExecution(args.apply));
  if (args.role === 'verification' || args.role === 'all') results.push(runVerification());

  if (args.json) {
    console.log(JSON.stringify({ role: args.role, apply: args.apply, results }, null, 2));
  } else {
    for (const r of results) {
      if (r.role === 'verification') {
        console.log(`[swarm-role-runner] role=verification processed=${r.summary.processed} blocked=${r.summary.blocked} quarantine=${r.summary.quarantine} posture=${r.summary.truth_posture}`);
      } else {
        console.log(`[swarm-role-runner] role=${r.role} ok=${r.ok} status=${r.status} tool=${r.tool}`);
      }
    }
  }

  const failed = results.some((r) => r.ok === false);
  process.exit(failed ? 1 : 0);
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  runGovernance,
  runExecution,
  runVerification,
};

