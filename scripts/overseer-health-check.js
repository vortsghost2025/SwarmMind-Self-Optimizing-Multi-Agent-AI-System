#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPOS = {
  archivist: '/home/we4free/agent/repos/Archivist-Agent',
  swarmmind: '/home/we4free/agent/repos/SwarmMind',
  kernel: '/home/we4free/agent/repos/kernel-lane',
  library: '/home/we4free/agent/repos/self-organizing-library',
};

const STALE_THRESHOLD_MIN = 30;
const LOG_DIR = '/home/we4free/agent/logs';
const REPORT_PATH = path.join(LOG_DIR, 'overseer-health.json');

function now() { return new Date().toISOString(); }
function fileAgeMin(fpath) {
  try { return Math.floor((Date.now() - fs.statSync(fpath).mtimeMs) / 60000); }
  catch (_) { return Infinity; }
}

const results = { timestamp: now(), lanes: {}, summary: { healthy: 0, degraded: 0, down: 0 } };

for (const [lane, repo] of Object.entries(REPOS)) {
  const laneResult = { lane, repo, checks: {} };

  // 1. Systemd service
  try {
    const status = execSync(`systemctl --user is-active ${lane}-lane-worker 2>&1`).toString().trim();
    laneResult.checks.systemd = status === 'active' ? 'PASS' : 'FAIL';
  } catch (_) { laneResult.checks.systemd = 'FAIL'; }

  // 2. Heartbeat freshness
  const hbPath = path.join(repo, 'lanes', lane, 'inbox', `heartbeat-${lane}.json`);
  const hbAge = fileAgeMin(hbPath);
  laneResult.checks.heartbeat = hbAge < STALE_THRESHOLD_MIN ? 'PASS' : `STALE_${hbAge}min`;

  // 3. Trust store exists and has 4 lanes
  try {
    const ts = JSON.parse(fs.readFileSync(path.join(repo, 'lanes/broadcast/trust-store.json'), 'utf8'));
    laneResult.checks.trust_store = Object.keys(ts).length >= 4 ? 'PASS' : `ONLY_${Object.keys(ts).length}_LANES`;
  } catch (_) { laneResult.checks.trust_store = 'MISSING'; }

  // 4. Lane-worker test
  try {
    const testOutput = execSync(`node ${repo}/scripts/test-lane-worker-we4free.js 2>&1`, { timeout: 30000 }).toString();
    const passMatch = testOutput.match(/PASS:\s*(\d+)/);
    const failMatch = testOutput.match(/FAIL:\s*(\d+)/);
    const passes = passMatch ? parseInt(passMatch[1]) : 0;
    const fails = failMatch ? parseInt(failMatch[1]) : 1;
    laneResult.checks.lane_worker_tests = fails === 0 && passes === 17 ? 'PASS' : `${passes}/${passes+fails}`;
  } catch (_) { laneResult.checks.lane_worker_tests = 'ERROR'; }

  // 5. Inbox counts
  const inboxBase = path.join(repo, 'lanes', lane, 'inbox');
  const quarantine = fs.readdirSync(path.join(inboxBase, 'quarantine')).filter(f => f.endsWith('.json')).length;
  const blocked = fs.readdirSync(path.join(inboxBase, 'blocked')).filter(f => f.endsWith('.json')).length;
  laneResult.checks.inbox_quarantine = quarantine;
  laneResult.checks.inbox_blocked = blocked;

  // 6. Recent daemon log entries
  const daemonLog = path.join(LOG_DIR, `${lane}-lane-worker.log`);
  try {
    const logAge = fileAgeMin(daemonLog);
    laneResult.checks.daemon_log = logAge < 10 ? 'RECENT' : `STALE_${logAge}min`;
  } catch (_) { laneResult.checks.daemon_log = 'MISSING'; }

  // Health determination
  const criticalPass = laneResult.checks.systemd === 'PASS' && laneResult.checks.trust_store === 'PASS';
  const operational = laneResult.checks.heartbeat === 'PASS' || laneResult.checks.heartbeat.startsWith('STALE');
  
  if (criticalPass && operational) {
    laneResult.health = 'healthy';
    results.summary.healthy++;
  } else if (criticalPass) {
    laneResult.health = 'degraded';
    results.summary.degraded++;
  } else {
    laneResult.health = 'down';
    results.summary.down++;
  }

  results.lanes[lane] = laneResult;
}

// Write report
fs.mkdirSync(LOG_DIR, { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify(results, null, 2) + '\n');

// Print summary
console.log(`\n=== OVERSEER HEALTH CHECK ${now()} ===\n`);
for (const [lane, r] of Object.entries(results.lanes)) {
  const icon = r.health === 'healthy' ? 'OK' : r.health === 'degraded' ? 'WARN' : 'DOWN';
  console.log(`  [${icon}] ${lane}: systemd=${r.checks.systemd} hb=${r.checks.heartbeat} trust=${r.checks.trust_store} tests=${r.checks.lane_worker_tests} q=${r.checks.inbox_quarantine} b=${r.checks.inbox_blocked}`);
}
console.log(`\n  Summary: ${results.summary.healthy} healthy, ${results.summary.degraded} degraded, ${results.summary.down} down`);
console.log(`  Report: ${REPORT_PATH}\n`);

process.exit(results.summary.down > 0 ? 1 : 0);
