#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(v) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return crypto.createHash('sha256').update(s).digest('hex');
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function verifyCheckpoints(trace, stateSnapshots) {
  const results = [];
  for (const cp of (trace.checkpoints || [])) {
    const snap = stateSnapshots[cp.name];
    if (snap === undefined) {
      results.push({ name: cp.name, expected: cp.state_hash, actual: 'MISSING_SNAPSHOT', ok: false });
      continue;
    }
    const actual = sha256(snap);
    results.push({ name: cp.name, expected: cp.state_hash, actual, ok: actual === cp.state_hash });
  }
  return results;
}

function validateTrace(tracePath, snapshotsPath) {
  const trace = loadJson(tracePath);
  const snapshots = snapshotsPath ? loadJson(snapshotsPath) : {};
  const cps = verifyCheckpoints(trace, snapshots);
  const toolCalls = (trace.tool_calls || []).length;
  const violations = (trace.constraint_evals || []).flatMap(e => e.violations || []);
  const report = {
    trace_id: trace.trace_id,
    run_id: trace.run_id,
    tool_calls: toolCalls,
    violations_count: violations.length,
    checkpoint_verification: cps,
    ok: cps.every(c => c.ok),
  };
  return report;
}

function replayTrace(tracePath, mode, outPath) {
  const trace = loadJson(tracePath);
  const replay = {
    trace_id: trace.trace_id,
    run_id: trace.run_id,
    mode,
    tool_calls_replayed: [],
  };

  for (const tc of (trace.tool_calls || [])) {
    replay.tool_calls_replayed.push({
      tool_call_id: tc.tool_call_id,
      tool: tc.tool,
      response: tc.response || null,
      status: tc.status || 'unknown',
    });
  }

  const resolved = path.resolve(outPath || 'replay-output.json');
  fs.writeFileSync(resolved, JSON.stringify(replay, null, 2), 'utf8');
  return { outPath: resolved, replayed_count: replay.tool_calls_replayed.length };
}

function parseArgs(argv) {
  const args = { command: null, trace: null, snapshots: null, mode: 'stub', out: 'replay-output.json' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === 'validate' || a === 'replay') { args.command = a; continue; }
    if (a === '--trace' && argv[i + 1]) { args.trace = argv[++i]; continue; }
    if (a === '--snapshots' && argv[i + 1]) { args.snapshots = argv[++i]; continue; }
    if (a === '--mode' && argv[i + 1]) { args.mode = argv[++i]; continue; }
    if (a === '--out' && argv[i + 1]) { args.out = argv[++i]; continue; }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);

  if (!args.command) {
    console.error('Usage: we4free-replay <validate|replay> --trace <path> [--snapshots <path>] [--mode stub|validate-only] [--out <path>]');
    process.exit(1);
  }

  if (!args.trace) {
    console.error('Error: --trace is required');
    process.exit(1);
  }

  if (args.command === 'validate') {
    const report = validateTrace(args.trace, args.snapshots);
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 2);
  }

  if (args.command === 'replay') {
    const result = replayTrace(args.trace, args.mode, args.out);
    console.log(`Wrote replay output: ${result.outPath} (${result.replayed_count} tool calls)`);
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { validateTrace, replayTrace, verifyCheckpoints, sha256 };
