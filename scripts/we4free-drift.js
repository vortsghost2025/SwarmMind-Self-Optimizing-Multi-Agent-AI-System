#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_WEIGHTS = { decision: 0.45, tool: 0.35, violation: 0.20 };

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function listTraceFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) continue;
    if (f.endsWith('.json')) out.push(full);
  }
  return out;
}

function summarizeTrace(t) {
  const violations = (t.constraint_evals || []).flatMap(e => e.violations || []);
  const decisions = (t.decision_path || []).map(d => d.decision || d.strategy || 'UNKNOWN');
  const tools = (t.tool_calls || []).map(c => c.tool || 'unknown');
  const degraded = decisions.includes('DEGRADE');
  return {
    tool_calls: (t.tool_calls || []).length,
    violations_count: violations.length,
    decisions,
    tools,
    degraded,
  };
}

function dist(counts, total) {
  const d = {};
  for (const [k, v] of Object.entries(counts)) d[k] = total ? v / total : 0;
  return d;
}

function buildProfile(dir) {
  const files = listTraceFiles(dir);
  const decCounts = {};
  const toolCounts = {};
  let viol = 0;
  let runs = 0;

  for (const f of files) {
    const t = loadJson(f);
    const s = summarizeTrace(t);
    runs += 1;
    if (s.violations_count > 0) viol += 1;
    for (const d of s.decisions) decCounts[d] = (decCounts[d] || 0) + 1;
    for (const tool of s.tools) toolCounts[tool] = (toolCounts[tool] || 0) + 1;
  }

  const decTotal = Object.values(decCounts).reduce((a, b) => a + b, 0);
  const toolTotal = Object.values(toolCounts).reduce((a, b) => a + b, 0);

  return {
    generated_at: new Date().toISOString(),
    runs,
    violRate: runs ? viol / runs : 0,
    decDist: dist(decCounts, decTotal),
    toolDist: dist(toolCounts, toolTotal),
  };
}

function driftScore(base, cur, weights) {
  const w = Object.assign({}, DEFAULT_WEIGHTS, weights || {});

  const keysDec = new Set([...Object.keys(base.decDist || {}), ...Object.keys(cur.decDist || {})]);
  let l1Dec = 0;
  for (const k of keysDec) l1Dec += Math.abs((base.decDist[k] || 0) - (cur.decDist[k] || 0));

  const keysTool = new Set([...Object.keys(base.toolDist || {}), ...Object.keys(cur.toolDist || {})]);
  let l1Tool = 0;
  for (const k of keysTool) l1Tool += Math.abs((base.toolDist[k] || 0) - (cur.toolDist[k] || 0));

  const violDelta = Math.abs((base.violRate || 0) - (cur.violRate || 0));

  const score = w.decision * l1Dec + w.tool * l1Tool + w.violation * violDelta;
  return { score, l1Dec, l1Tool, violDelta };
}

function parseArgs(argv) {
  const args = { command: null, traces: null, baseline: null, out: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === 'baseline' || a === 'compare') { args.command = a; continue; }
    if (a === '--traces' && argv[i + 1]) { args.traces = argv[++i]; continue; }
    if (a === '--baseline' && argv[i + 1]) { args.baseline = argv[++i]; continue; }
    if (a === '--out' && argv[i + 1]) { args.out = argv[++i]; continue; }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);

  if (!args.command) {
    console.error('Usage: we4free-drift <baseline|compare> --traces <dir> [--baseline <path>] [--out <path>]');
    process.exit(1);
  }

  if (!args.traces) {
    console.error('Error: --traces is required');
    process.exit(1);
  }

  if (args.command === 'baseline') {
    const profile = buildProfile(args.traces);
    const outPath = args.out || 'baseline.json';
    fs.writeFileSync(outPath, JSON.stringify(profile, null, 2), 'utf8');
    console.log(`Wrote baseline: ${outPath}`);
    process.exit(0);
  }

  if (args.command === 'compare') {
    if (!args.baseline) {
      console.error('Error: --baseline is required for compare');
      process.exit(1);
    }
    const base = loadJson(args.baseline);
    const cur = buildProfile(args.traces);
    const drift = driftScore(base, cur);

    const flags = {
      drift_high: drift.score >= 0.35,
      drift_medium: drift.score >= 0.20 && drift.score < 0.35,
      viol_spike: drift.violDelta >= 0.10,
    };

    const report = { baseline: base, current: cur, drift, flags };
    const outPath = args.out || 'drift-report.json';
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Wrote drift report: ${outPath}`);
    process.exit(flags.drift_high || flags.viol_spike ? 2 : 0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { buildProfile, driftScore, summarizeTrace, listTraceFiles };
