'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_WEIGHTS = {
  decision: 0.45,
  tool: 0.35,
  violation: 0.20,
};

function driftScore(trace, weights) {
  const w = Object.assign({}, DEFAULT_WEIGHTS, weights || {});
  const decisionDrift = _decisionDrift(trace);
  const toolDrift = _toolDrift(trace);
  const violationDrift = _violationDrift(trace);
  const score = (w.decision * decisionDrift) + (w.tool * toolDrift) + (w.violation * violationDrift);
  return {
    score: Math.min(Math.max(score, 0), 1),
    components: {
      decision: { raw: decisionDrift, weight: w.decision },
      tool: { raw: toolDrift, weight: w.tool },
      violation: { raw: violationDrift, weight: w.violation },
    },
    interpretation: _interpret(score),
  };
}

function _decisionDrift(trace) {
  const decisions = trace.decision_path || [];
  if (decisions.length === 0) return 0;
  let reversals = 0;
  let stale = 0;
  const now = Date.now();
  for (let i = 1; i < decisions.length; i++) {
    const prev = decisions[i - 1].decision || '';
    const curr = decisions[i].decision || '';
    if (_isReversal(prev, curr)) reversals++;
  }
  const decisionWindowMs = 300000;
  for (const d of decisions) {
    const ts = Date.parse(d.ts);
    if (!Number.isNaN(ts) && (now - ts) > decisionWindowMs) stale++;
  }
  const reversalRate = reversals / Math.max(decisions.length - 1, 1);
  const staleRate = stale / decisions.length;
  return Math.min(reversalRate + staleRate, 1);
}

function _isReversal(prev, curr) {
  const reversalPairs = [
    ['PROCEED', 'BLOCK'], ['BLOCK', 'PROCEED'],
    ['APPROVE', 'REJECT'], ['REJECT', 'APPROVE'],
    ['PASS', 'FAIL'], ['FAIL', 'PASS'],
    ['VERIFIED', 'UNVERIFIED'], ['UNVERIFIED', 'VERIFIED'],
  ];
  for (const [a, b] of reversalPairs) {
    if (prev.includes(a) && curr.includes(b)) return true;
  }
  return false;
}

function _toolDrift(trace) {
  const calls = trace.tool_calls || [];
  if (calls.length === 0) return 0;
  let failed = 0;
  let retries = 0;
  const seen = new Map();
  for (const call of calls) {
    if (call.status === 'fail' || call.status === 'error') failed++;
    const key = `${call.tool}:${JSON.stringify(call.args || '')}`;
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    if (count > 1) retries++;
  }
  const failRate = failed / calls.length;
  const retryRate = retries / calls.length;
  return Math.min(failRate * 0.7 + retryRate * 0.3, 1);
}

function _violationDrift(trace) {
  const evals = trace.constraint_evals || [];
  if (evals.length === 0) return 0;
  let highCount = 0;
  let medCount = 0;
  for (const e of evals) {
    if (e.result === 'fail') {
      if (e.severity === 'high' || e.severity === 'critical') highCount++;
      else medCount++;
    }
  }
  const highRate = highCount / evals.length;
  const medRate = medCount / evals.length;
  return Math.min(highRate * 0.8 + medRate * 0.2, 1);
}

function _interpret(score) {
  if (score < 0.15) return 'stable';
  if (score < 0.40) return 'minor_drift';
  if (score < 0.70) return 'significant_drift';
  return 'critical_drift';
}

function verifyTraceIntegrity(trace) {
  const issues = [];
  if (!trace.trace_id) issues.push('missing trace_id');
  if (!trace.timestamp_start) issues.push('missing timestamp_start');
  if (!trace.timestamp_end) issues.push('trace not finalized (no timestamp_end)');
  if (!Array.isArray(trace.decision_path)) issues.push('decision_path missing or not array');
  if (!Array.isArray(trace.constraint_evals)) issues.push('constraint_evals missing or not array');
  if (trace.checkpoints) {
    for (const cp of trace.checkpoints) {
      if (!cp.state_hash) issues.push(`checkpoint ${cp.name || '?'} missing state_hash`);
    }
  }
  return {
    valid: issues.length === 0,
    issues,
    trace_id: trace.trace_id || null,
  };
}

module.exports = { driftScore, verifyTraceIntegrity, DEFAULT_WEIGHTS };
