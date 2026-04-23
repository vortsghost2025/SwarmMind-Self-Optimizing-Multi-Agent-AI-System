#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { atomicWriteJson } = require('./atomic-write-util');

const LANE_ROOTS = {
  archivist: 'S:/Archivist-Agent',
  library: 'S:/self-organizing-library',
  swarmmind: 'S:/SwarmMind Self-Optimizing Multi-Agent AI System',
  kernel: 'S:/kernel-lane',
};

const BROADCAST_TRUST_STORE_REL = path.join('lanes', 'broadcast', 'trust-store.json');

function readPublicKeyPem(lane) {
  const candidates = [
    path.join(LANE_ROOTS[lane], '.identity', 'public.pem'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8').trim();
    }
  }
  const broadcastPath = path.join(LANE_ROOTS[lane], BROADCAST_TRUST_STORE_REL);
  if (fs.existsSync(broadcastPath)) {
    try {
      const store = JSON.parse(fs.readFileSync(broadcastPath, 'utf8'));
      const entry = store[lane] || store.lanes?.[lane];
      if (entry?.public_key_pem) {
        return entry.public_key_pem.trim();
      }
    } catch {}
  }
  throw new Error(`Cannot find public key PEM for ${lane}`);
}

function computeFingerprint(pem) {
  const der = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s/g, '');
  const buf = Buffer.from(der, 'base64');
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sync() {
  const report = { lanes: {}, discrepancies: [], converged: false };
  const pems = {};
  const keyIds = {};

  for (const lane of Object.keys(LANE_ROOTS)) {
    try {
      const pem = readPublicKeyPem(lane);
      pems[lane] = pem;
      keyIds[lane] = computeFingerprint(pem).substring(0, 16);
      report.lanes[lane] = { key_id: keyIds[lane], source: '.identity/public.pem' };
    } catch (err) {
      report.lanes[lane] = { error: err.message };
    }
  }

  const uniqueKeyIds = new Set(Object.values(keyIds));
  const uniquePems = new Set(Object.values(pems).map(p => p.trim()));

  report.converged = uniqueKeyIds.size === Object.keys(keyIds).length &&
    Object.keys(keyIds).length === 4;

  if (!report.converged) {
    report.summary = `Trust stores diverge: ${uniqueKeyIds.size} unique key_ids`;
  } else {
    report.summary = 'All 4 lanes have distinct, correct key_ids';
  }

  return { pems, keyIds, report };
}

function buildUnifiedStore() {
  const { pems, keyIds, report } = sync();
  if (report.converged) {
    const existingStore = JSON.parse(
      fs.readFileSync(path.join(LANE_ROOTS.archivist, BROADCAST_TRUST_STORE_REL), 'utf8')
    );
    let needsUpdate = false;
    for (const lane of Object.keys(LANE_ROOTS)) {
      if (existingStore[lane]?.key_id !== keyIds[lane]) {
        needsUpdate = true;
        break;
      }
    }
    if (!needsUpdate) {
      return { report, action: 'none', reason: 'already converged and deployed' };
    }
  }

  const now = new Date().toISOString();
  const unified = {};
  for (const [lane, pem] of Object.entries(pems)) {
    unified[lane] = {
      lane_id: lane,
      public_key_pem: pem,
      algorithm: 'RS256',
      key_id: keyIds[lane],
      registered_at: now,
      expires_at: null,
      revoked_at: null,
    };
  }
  unified.preCommitChecks = [
    'signature_validates_against_key_id',
    'key_id_matches_trust_store_entry',
    'lane_id_invariant',
  ];

  const results = {};
  for (const [lane, root] of Object.entries(LANE_ROOTS)) {
    const broadcastPath = path.join(root, BROADCAST_TRUST_STORE_REL);
    try {
      atomicWriteJson(broadcastPath, unified);
      const verify = JSON.parse(fs.readFileSync(broadcastPath, 'utf8'));
      results[lane] = verify[lane]?.key_id === keyIds[lane] ? 'verified' : 'MISMATCH';
    } catch (err) {
      results[lane] = `error: ${err.message}`;
    }
  }

  return { report, action: 'synced', results, unified };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const mode = args[0] || 'check';

  if (mode === 'check') {
    const { report } = sync();
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.converged ? 0 : 1);
  } else if (mode === 'sync') {
    const result = buildUnifiedStore();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.action === 'synced' || result.action === 'none' ? 0 : 1);
  } else {
    console.error('Usage: node sync-trust-store.js [check|sync]');
    process.exit(1);
  }
}

module.exports = { sync, buildUnifiedStore };
