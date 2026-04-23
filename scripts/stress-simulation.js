#!/usr/bin/env node
'use strict';
/**
 * stress-simulation.js
 * Runs 50 rounds of random message creation across lanes, optionally corrupting evidence.
 * Generates a JSON report at docs/autonomous-cycle-test/round-007-stress-report.json.
 */

const { buildMessage } = require('./build-message');
const { guardWrite } = require('./outbox-write-guard');
const fs = require('fs');
const path = require('path');

const LANES = ['archivist', 'library', 'swarmmind', 'kernel'];

function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomDelay() { return new Promise(r => setTimeout(r, Math.floor(Math.random() * 2000))); }
function maybeCorrupt(msg) {
  if (Math.random() < 0.3) {
    if (msg.evidence && msg.evidence.evidence_path) {
      msg.evidence.evidence_path = msg.evidence.evidence_path.replace(/\.json$/, '.corrupt.json');
    }
    if (msg.evidence_hash) {
      msg.evidence_hash = 'sha256:' + '0'.repeat(64);
    }
  }
  return msg;
}

async function runRound(round) {
  const from = randomChoice(LANES);
  const to = randomChoice(LANES.filter(l => l !== from));
  const taskId = `stress-${round}`;
  const subject = `Stress round ${round}`;
  const body = `Automated stress test message from ${from} to ${to}`;

  const rawMsg = buildMessage({
    from,
    to,
    type: 'task',
    priority: 'P2',
    subject,
    taskId,
    body,
    requiresAction: false,
  });

  const msg = maybeCorrupt(rawMsg);

  const outboxDir = path.join(__dirname, '..', 'lanes', from, 'outbox');
  if (!fs.existsSync(outboxDir)) fs.mkdirSync(outboxDir, { recursive: true });
  const filename = msg.id + '.json';
  const outPath = path.join(outboxDir, filename);
  fs.writeFileSync(outPath, JSON.stringify(msg, null, 2), 'utf8');

  let blocked = false;
  let guardErr = null;
  try { guardWrite(msg, outboxDir, filename); }
  catch (e) { blocked = true; guardErr = e.message; }

  return { round, from, to, blocked, guardError: guardErr, corrupted: msg.evidence && msg.evidence.evidence_path && msg.evidence.evidence_path.includes('.corrupt') };
}

async function main() {
  const results = [];
  for (let i = 1; i <= 50; i++) {
    await randomDelay();
    results.push(await runRound(i));
  }
  const outDir = path.join(process.cwd(), 'docs', 'autonomous-cycle-test');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'round-007-stress-report.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf8');
  console.log('Stress simulation completed. Report:', outFile);
}

if (require.main === module) { main(); }

