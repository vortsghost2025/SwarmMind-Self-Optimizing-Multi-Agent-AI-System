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
const DBUS = 'DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus';

function now() { return new Date().toISOString(); }
function fileAgeMin(fpath) {
  try { return Math.floor((Date.now() - fs.statSync(fpath).mtimeMs) / 60000); }
  catch (_) { return Infinity; }
}

const results = { timestamp: now(), lanes: {}, summary: { healthy: 0, degraded: 0, down: 0 } };

for (const [lane, repo] of Object.entries(REPOS)) {
  const laneResult = { lane, repo, checks: {} };

  // 1. Process check — is a lane-worker process actually running?
  try {
    const psOutput = execSync(`ps -eo pid,args 2>/dev/null`).toString();
    const running = psOutput.split('\n').some(line =>
      line.includes('lane-worker') && line.includes(`--lane ${lane}`)
    );
    laneResult.checks.process = running ? 'PASS' : 'FAIL';
  } catch (_) { laneResult.checks.process = 'FAIL'; }

  // 2. Systemd service (may fail from cron due to missing DBUS — that's OK)
  try {
    const status = execSync(`${DBUS} systemctl --user is-active ${lane}-lane-worker 2>&1`).toString().trim();
    laneResult.checks.systemd = status === 'active' ? 'PASS' : 'FAIL';
  } catch (_) { laneResult.checks.systemd = 'FAIL'; }

  // 3. Heartbeat freshness
  const hbPath = path.join(repo, 'lanes', lane, 'inbox', `heartbeat-${lane}.json`);
  const hbAge = fileAgeMin(hbPath);
  laneResult.checks.heartbeat = hbAge < STALE_THRESHOLD_MIN ? 'PASS' : `STALE_${hbAge}min`;

  // 4. Trust store exists and has 4 lanes
  try {
    const ts = JSON.parse(fs.readFileSync(path.join(repo, 'lanes/broadcast/trust-store.json'), 'utf8'));
    laneResult.checks.trust_store = Object.keys(ts).length >= 4 ? 'PASS' : `ONLY_${Object.keys(ts).length}_LANES`;
  } catch (_) { laneResult.checks.trust_store = 'MISSING'; }

  // 5. Inbox counts
  const inboxBase = path.join(repo, 'lanes', lane, 'inbox');
  try {
    const quarantine = fs.readdirSync(path.join(inboxBase, 'quarantine')).filter(f => f.endsWith('.json')).length;
    const blocked = fs.readdirSync(path.join(inboxBase, 'blocked')).filter(f => f.endsWith('.json')).length;
    laneResult.checks.inbox_quarantine = quarantine;
    laneResult.checks.inbox_blocked = blocked;
  } catch (_) {
    laneResult.checks.inbox_quarantine = -1;
    laneResult.checks.inbox_blocked = -1;
  }

  // 6. Recent daemon log entries
  const daemonLog = path.join(LOG_DIR, `${lane}-lane-worker.log`);
  try {
    const logAge = fileAgeMin(daemonLog);
    laneResult.checks.daemon_log = logAge < 10 ? 'RECENT' : `STALE_${logAge}min`;
  } catch (_) { laneResult.checks.daemon_log = 'MISSING'; }

  // Health determination — process running is the primary signal, not systemd
  const criticalPass = laneResult.checks.process === 'PASS' && laneResult.checks.trust_store === 'PASS';
  const heartbeatOk = laneResult.checks.heartbeat === 'PASS';

  if (criticalPass && heartbeatOk) {
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
  console.log(`  [${icon}] ${lane}: proc=${r.checks.process} systemd=${r.checks.systemd} hb=${r.checks.heartbeat} trust=${r.checks.trust_store} q=${r.checks.inbox_quarantine} b=${r.checks.inbox_blocked}`);
}
console.log(`\n  Summary: ${results.summary.healthy} healthy, ${results.summary.degraded} degraded, ${results.summary.down} down`);
console.log(`  Report: ${REPORT_PATH}`);

console.log(`\nOUTPUT_PROVENANCE:`);
console.log(`  agent: opencode-glm5`);
console.log(`  lane: swarmmind`);
console.log(`  target: 4-lane autonomous runtime health oversight`);

process.exit(results.summary.down > 0 ? 1 : 0);
