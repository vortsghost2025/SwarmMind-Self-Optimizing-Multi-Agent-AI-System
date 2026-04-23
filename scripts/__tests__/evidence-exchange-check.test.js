#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { verifyEvidence, scanLane } = require('../evidence-exchange-check');

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${label}`); }
}

(function testBaseDirResolution() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evx-base-'));
  const evidenceDir = path.join(tmp, 'docs', 'proof');
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, 'artifact.txt'), 'data');

  const msg = {
    evidence: {
      required: true,
      evidence_path: 'docs/proof/artifact.txt',
    },
  };

  const result = verifyEvidence(msg, tmp);
  assert(result.evidence_path_exists === true, 'baseDir: relative path resolves against lane base, not cwd');
  assert(!result.errors.includes('evidence_path_missing'), 'baseDir: no false missing-evidence error');

  const wrongResult = verifyEvidence(msg, os.tmpdir());
  assert(wrongResult.evidence_path_exists === false, 'baseDir: wrong baseDir correctly reports missing');

  try { fs.rmSync(tmp, { recursive: true }); } catch {}
})();

(function testProcessedPathHandling() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evx-proc-'));
  const inboxProcessed = path.join(tmp, 'lanes', 'testlane', 'inbox', 'processed');
  const outbox = path.join(tmp, 'lanes', 'testlane', 'outbox');
  fs.mkdirSync(inboxProcessed, { recursive: true });
  fs.mkdirSync(outbox, { recursive: true });

  fs.writeFileSync(path.join(inboxProcessed, 'kernel-response.json'), '{}');

  const msg = {
    from: 'testlane',
    to: 'kernel',
    evidence: {
      required: true,
      evidence_path: path.join(inboxProcessed, 'kernel-response.json'),
    },
  };
  fs.writeFileSync(path.join(outbox, 'ack.json'), JSON.stringify(msg));

  const result = verifyEvidence(msg, tmp);
  assert(result.evidence_path_exists === true, 'processed: absolute path to processed/ resolves');
  assert(!result.errors.includes('evidence_path_missing'), 'processed: no false missing-evidence error');

  const staleMsg = {
    from: 'testlane',
    to: 'kernel',
    evidence: {
      required: true,
      evidence_path: path.join(tmp, 'lanes', 'testlane', 'inbox', 'kernel-response.json'),
    },
  };
  const staleResult = verifyEvidence(staleMsg, tmp);
  assert(staleResult.evidence_path_exists === false, 'processed: stale inbox path (pre-processed move) correctly reports missing');

  const report = scanLane('testlane', tmp);
  assert(report.total === 1, 'processed: scanLane counts outbox message');
  assert(report.verified === 1, 'processed: scanLane verifies message with valid processed/ evidence');
  assert(report.missingEvidence.length === 0, 'processed: no false missingEvidence entries');

  try { fs.rmSync(tmp, { recursive: true }); } catch {}
})();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
