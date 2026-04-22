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

function readTrustStore(lane) {
  const trustPath = path.join(LANE_ROOTS[lane], '.trust', 'keys.json');
  try {
    return JSON.parse(fs.readFileSync(trustPath, 'utf8'));
  } catch (err) {
    return { error: err.message, lane };
  }
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
  const stores = {};
  const fingerprints = {};
  const report = { lanes: {}, discrepancies: [], converged: false };

  for (const lane of Object.keys(LANE_ROOTS)) {
    const store = readTrustStore(lane);
    stores[lane] = store;
    if (store.public_key_pem) {
      fingerprints[lane] = computeFingerprint(store.public_key_pem);
    }
    report.lanes[lane] = {
      key_id: store.key_id || 'MISSING',
      fingerprint: fingerprints[lane] || 'MISSING',
      error: store.error || null,
    };
  }

  const uniqueFingerprints = new Set(Object.values(fingerprints));
  const uniqueKeyIds = new Set(Object.values(stores).map(s => s.key_id));

  if (uniqueFingerprints.size === 1 && uniqueKeyIds.size === 1) {
    report.converged = true;
    report.summary = 'All lanes share identical trust store (key_id + PEM)';
  } else {
    report.converged = false;
    report.summary = `Trust stores diverge: ${uniqueKeyIds.size} unique key_ids, ${uniqueFingerprints.size} unique PEMs`;
    for (const [lane, store] of Object.entries(stores)) {
      for (const [otherLane, otherStore] of Object.entries(stores)) {
        if (lane >= otherLane) continue;
        if (store.key_id !== otherStore.key_id || fingerprints[lane] !== fingerprints[otherLane]) {
          report.discrepancies.push({
            lanes: [lane, otherLane],
            key_id_match: store.key_id === otherStore.key_id,
            pem_match: fingerprints[lane] === fingerprints[otherLane],
          });
        }
      }
    }
  }

  return report;
}

function buildUnifiedStore() {
  const report = sync();
  if (report.converged) {
    return { report, action: 'none', reason: 'already converged' };
  }

  const archivistStore = readTrustStore('archivist');
  if (!archivistStore.public_key_pem || !archivistStore.key_id) {
    return { report, action: 'blocked', reason: 'archivist trust store missing or corrupt — cannot use as authority' };
  }

  const unified = {
    key_id: archivistStore.key_id,
    public_key_pem: archivistStore.public_key_pem,
    unified_by: 'swarmmind',
    unified_at: new Date().toISOString(),
  };

  const results = {};
  for (const [lane, root] of Object.entries(LANE_ROOTS)) {
    const trustDir = path.join(root, '.trust');
    const trustPath = path.join(trustDir, 'keys.json');
    try {
      if (!fs.existsSync(trustDir)) {
        fs.mkdirSync(trustDir, { recursive: true });
      }
      const backupPath = path.join(trustDir, 'keys.json.pre-sync-backup');
      if (fs.existsSync(trustPath)) {
        const existing = fs.readFileSync(trustPath, 'utf8');
        atomicWriteJson(backupPath, existing);
      }
      atomicWriteJson(trustPath, unified);
      results[lane] = 'updated';
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
    const report = sync();
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.converged ? 0 : 1);
  } else if (mode === 'sync') {
    const result = buildUnifiedStore();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.action === 'synced' ? 0 : 1);
  } else {
    console.error('Usage: node sync-trust-store.js [check|sync]');
    process.exit(1);
  }
}

module.exports = { sync, buildUnifiedStore };
