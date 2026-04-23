#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const IDENTITY_DIR = path.join(ROOT, '.identity');
const SNAPSHOT_PATH = path.join(IDENTITY_DIR, 'snapshot.json');
const SNAPSHOT_JWS_PATH = path.join(IDENTITY_DIR, 'snapshot.jws');
const PRIVATE_KEY_PATH = path.join(IDENTITY_DIR, 'private.pem');

const PASSFILE_CANDIDATES = [
  path.join(ROOT, '.runtime', 'lane-passphrases.json'),
  'S:/Archivist-Agent/.runtime/lane-passphrases.json'
];

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

function base64UrlEncode(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function resolvePassphrase() {
  if (process.env.LANE_KEY_PASSPHRASE) return process.env.LANE_KEY_PASSPHRASE;
  if (process.env.LANE_KEY_PASSPHRASE_SWARMMIND) return process.env.LANE_KEY_PASSPHRASE_SWARMMIND;

  for (const passfile of PASSFILE_CANDIDATES) {
    try {
      if (!fs.existsSync(passfile)) continue;
      const parsed = JSON.parse(fs.readFileSync(passfile, 'utf8'));
      if (parsed && typeof parsed === 'object' && parsed.swarmmind) {
        const val = parsed.swarmmind;
        return typeof val === 'object' && val.passphrase ? val.passphrase : val;
      }
    } catch (_) {}
  }

  return null;
}

function loadPrivateKey(passphrase) {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    throw new Error('Private key not found at ' + PRIVATE_KEY_PATH);
  }
  const encryptedKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  try {
    return crypto.createPrivateKey({
      key: encryptedKey,
      passphrase: passphrase,
      format: 'pem'
    });
  } catch (e) {
    throw new Error('Failed to decrypt private key: ' + e.message);
  }
}

function getKeyIdFromMeta() {
  const metaPath = path.join(IDENTITY_DIR, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    throw new Error('meta.json not found at ' + metaPath);
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  if (!meta.key_id) {
    throw new Error('key_id not found in meta.json');
  }
  return meta.key_id;
}

function signSnapshot() {
  console.log('=== Identity Snapshot Signing v0.2 (swarmmind) ===\n');

  if (!fs.existsSync(SNAPSHOT_PATH)) {
    console.error('ERROR: snapshot.json not found at', SNAPSHOT_PATH);
    process.exit(1);
  }

  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  console.log('Loaded snapshot.json');
  console.log('  Version:', snapshot.version);
  console.log('  Identity ID:', snapshot.identity?.id);
  console.log('  Lane:', snapshot.identity?.lane);

  const passphrase = resolvePassphrase();
  if (!passphrase) {
    throw new Error('PASSPHRASE_MISSING: no passphrase found for lane swarmmind');
  }

  const privateKey = loadPrivateKey(passphrase);
  console.log('\nPrivate key loaded and decrypted');

  const keyId = getKeyIdFromMeta();
  console.log('Key ID from meta.json:', keyId);

  if (snapshot.identity?.key_id && snapshot.identity.key_id !== keyId) {
    console.error('WARNING: snapshot.key_id mismatch with meta.json');
    console.error('  Snapshot:', snapshot.identity.key_id);
    console.error('  meta.json:', keyId);
  }

  const header = {
    alg: 'RS256',
    typ: 'JWS',
    kid: keyId
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(stableStringify(snapshot));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey);
  const signatureB64 = base64UrlEncode(signature);

  const jws = `${headerB64}.${payloadB64}.${signatureB64}`;

  const tmpPath = SNAPSHOT_JWS_PATH + '.tmp';
  fs.writeFileSync(tmpPath, jws);
  fs.renameSync(tmpPath, SNAPSHOT_JWS_PATH);

  console.log('\nSigned snapshot written to:', SNAPSHOT_JWS_PATH);
  console.log('JWS length:', jws.length, 'characters');
  console.log('\n=== SIGNING COMPLETE ===');

  return { success: true, jwsPath: SNAPSHOT_JWS_PATH, keyId };
}

try {
  signSnapshot();
} catch (e) {
  console.error('\nERROR:', e.message);
  process.exit(1);
}
