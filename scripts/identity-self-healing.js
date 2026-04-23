#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEY_SIZE = 2048;
const PASSFILE_SEARCH = [
  'S:/Archivist-Agent/.runtime/lane-passphrases.json',
  'S:/self-organizing-library/.runtime/lane-passphrases.json',
  'S:/SwarmMind/.runtime/lane-passphrases.json',
  'S:/kernel-lane/.runtime/lane-passphrases.json',
];

const LANE_IDENTITY_DIRS = {
  archivist: 'S:/Archivist-Agent/.identity',
  library: 'S:/self-organizing-library/.identity',
  swarmmind: 'S:/SwarmMind/.identity',
  kernel: 'S:/kernel-lane/.identity',
};

class IdentitySelfHealing {
  constructor(options = {}) {
    this.laneId = options.laneId || 'unknown';
    this.identityDir = options.identityDir || LANE_IDENTITY_DIRS[this.laneId];
    this.passfilePath = options.passfilePath || null;
    this._log = options.logger || ((level, msg) => console.log(`[identity-heal] [${level}] ${msg}`));
  }

  check() {
    const result = {
      laneId: this.laneId,
      identityDir: this.identityDir,
      keysPresent: false,
      keysRegenerated: false,
      trustStoreUpdated: false,
      passphraseSource: null,
      keyId: null,
      error: null,
    };

    if (!this.identityDir) {
      result.error = 'NO_IDENTITY_DIR';
      return result;
    }

    const pubPath = path.join(this.identityDir, 'public.pem');
    const privPath = path.join(this.identityDir, 'private.pem');
    result.keysPresent = fs.existsSync(pubPath) && fs.existsSync(privPath);

  if (result.keysPresent) {
    try {
      const pub = fs.readFileSync(pubPath, 'utf8');
      const { deriveKeyId } = require("./.global/deriveKeyId.js");
      result.keyId = deriveKeyId(pub);
      // Verify keys are decryptable with known passphrase — don't regenerate if they work
      const passphrase = this._findPassphrase();
      if (passphrase) {
        try {
          const priv = fs.readFileSync(privPath, 'utf8');
          crypto.createPrivateKey({ key: priv, passphrase, format: 'pem' });
          this._log('INFO', `keys present and decryptable: ${this.laneId} keyId=${result.keyId}`);
          // Ensure meta.json and snapshot.json exist even if keys were already present
          this._ensureMetadataAndSnapshot(pub, result.keyId, passphrase);
          return result; // Keys are good — skip any regeneration
        } catch (decryptErr) {
          this._log('WARN', `keys present but NOT decryptable — regenerating: ${this.laneId}`);
          result.keysPresent = false; // treat as missing so regeneration happens
        }
      } else {
        this._log('INFO', `keys present (no passphrase to verify): ${this.laneId} keyId=${result.keyId}`);
      }
    } catch (e) {
      result.error = `KEY_READ_FAILED: ${e.message}`;
      result.keysPresent = false;
    }
  }

    if (!result.keysPresent) {
      this._log('WARN', `keys MISSING for ${this.laneId} — attempting self-heal`);
      const healed = this._regenerate();
      if (healed) {
        result.keysRegenerated = true;
        result.trustStoreUpdated = healed.trustStoreUpdated;
        result.passphraseSource = healed.passphraseSource;
        result.keyId = healed.keyId;
        result.keysPresent = true;
      } else {
        result.error = healed?.error || 'REGENERATION_FAILED';
      }
    }

    return result;
  }

  _regenerate() {
    const passphrase = this._findPassphrase();
    if (!passphrase) {
      this._log('ERROR', `no passphrase found for ${this.laneId} — cannot self-heal`);
      return { error: 'NO_PASSPHRASE' };
    }

    try {
      fs.mkdirSync(this.identityDir, { recursive: true });

      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: KEY_SIZE,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
          cipher: 'aes-256-cbc',
          passphrase: passphrase,
        },
      });

      fs.writeFileSync(path.join(this.identityDir, 'public.pem'), publicKey);
      fs.writeFileSync(path.join(this.identityDir, 'private.pem'), privateKey);
      const { deriveKeyId } = require("./.global/deriveKeyId.js");
      const keyId = deriveKeyId(publicKey);
      const keyId = crypto.createHash('sha256').update(publicKey).digest('hex').substring(0, 16);

      const meta = {
        lane_id: this.laneId,
        key_id: keyId,
        algorithm: 'RS256',
        generated_at: new Date().toISOString(),
        self_healed: true,
      };
      fs.writeFileSync(path.join(this.identityDir, 'meta.json'), JSON.stringify(meta, null, 2));

      this._log('INFO', `keys regenerated: ${this.laneId} keyId=${keyId}`);

      // Create and sign snapshot.json
      this._createAndSignSnapshot(keyId, passphrase);

      const trustStoreUpdated = this._updateTrustStores(publicKey, keyId);

      return { keyId, passphraseSource: this._passphraseSource, trustStoreUpdated };
    } catch (e) {
      this._log('ERROR', `regeneration failed for ${this.laneId}: ${e.message}`);
      return { error: `REGENERATION_ERROR: ${e.message}` };
    }
  }

  _ensureMetadataAndSnapshot(publicKey, keyId, passphrase) {
    const metaPath = path.join(this.identityDir, 'meta.json');
    const snapshotPath = path.join(this.identityDir, 'snapshot.json');
    const snapshotJwsPath = path.join(this.identityDir, 'snapshot.jws');

    // Write meta.json if missing or has wrong key_id
    let needMetaWrite = true;
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (meta.key_id === keyId) needMetaWrite = false;
      } catch (_) {}
    }
    if (needMetaWrite) {
      const meta = {
        lane_id: this.laneId,
        key_id: keyId,
        algorithm: 'RS256',
        generated_at: new Date().toISOString(),
        self_healed: true,
      };
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      this._log('INFO', `meta.json written for ${this.laneId} keyId=${keyId}`);
    }

    // Write snapshot.json and sign if missing or has wrong key_id
    let needSnapshotWrite = true;
    if (fs.existsSync(snapshotPath)) {
      try {
        const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
        if (snap.identity && snap.identity.key_id === keyId) needSnapshotWrite = false;
      } catch (_) {}
    }
    if (needSnapshotWrite) {
      this._createAndSignSnapshot(keyId, passphrase);
    } else if (!fs.existsSync(snapshotJwsPath)) {
      // snapshot.json exists but no JWS — sign it
      this._signSnapshot(passphrase);
    }
  }

  _createAndSignSnapshot(keyId, passphrase) {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days
    const snapshot = {
      version: '2.0',
      identity: {
        id: `${this.laneId}-agent-001`,
        lane: this.laneId,
        authority: this.laneId === 'archivist' ? 100 : this.laneId === 'library' ? 90 : this.laneId === 'swarmmind' ? 80 : 70,
        created_at: now,
        model_origin: 'nvidia/glm5',
        last_updated: now,
        issued_by: this.laneId,
        key_id: keyId,
        expires_at: expiresAt,
      },
      invariants: [],
      trust_state: {
        lanes_registered: ['archivist', 'library', 'swarmmind', 'kernel'],
        last_verification: now,
        quarantine_count: 0,
        handoffs_triggered: 0,
      },
      open_loops: [],
      goals: [],
      context_fingerprint: {
        files_read: [],
        key_decisions: [],
        last_activity: now,
      },
    };
    fs.writeFileSync(path.join(this.identityDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2));
    this._log('INFO', `snapshot.json written for ${this.laneId} keyId=${keyId}`);
    this._signSnapshot(passphrase);
  }

  _signSnapshot(passphrase) {
    try {
      const snapshotPath = path.join(this.identityDir, 'snapshot.json');
      const jwsPath = path.join(this.identityDir, 'snapshot.jws');
      const privPath = path.join(this.identityDir, 'private.pem');
      const metaPath = path.join(this.identityDir, 'meta.json');

      if (!fs.existsSync(snapshotPath) || !fs.existsSync(privPath) || !fs.existsSync(metaPath)) {
        this._log('WARN', `cannot sign snapshot — missing files for ${this.laneId}`);
        return;
      }

      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      const keyId = meta.key_id;
      const encryptedKey = fs.readFileSync(privPath, 'utf8');
      const privateKey = crypto.createPrivateKey({ key: encryptedKey, passphrase, format: 'pem' });

      const header = { alg: 'RS256', typ: 'JWS', kid: keyId };
      const headerB64 = this._base64UrlEncode(JSON.stringify(header));
      const payloadB64 = this._base64UrlEncode(this._stableStringify(snapshot));
      const signingInput = `${headerB64}.${payloadB64}`;
      const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey);
      const signatureB64 = this._base64UrlEncode(signature);
      const jws = `${headerB64}.${payloadB64}.${signatureB64}`;

      fs.writeFileSync(jwsPath, jws);
      this._log('INFO', `snapshot.jws written for ${this.laneId} keyId=${keyId}`);
    } catch (e) {
      this._log('ERROR', `snapshot signing failed for ${this.laneId}: ${e.message}`);
    }
  }

  _stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(v => this._stableStringify(v)).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + this._stableStringify(value[k])).join(',') + '}';
  }

  _base64UrlEncode(data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  _findPassphrase() {
    if (process.env.LANE_KEY_PASSPHRASE) {
      this._passphraseSource = 'env';
      return process.env.LANE_KEY_PASSPHRASE;
    }

    const laneKeyVar = `LANE_KEY_PASSPHRASE_${this.laneId.toUpperCase()}`;
    if (process.env[laneKeyVar]) {
      this._passphraseSource = 'env-lane';
      return process.env[laneKeyVar];
    }

    for (const passfile of PASSFILE_SEARCH) {
      try {
        if (!fs.existsSync(passfile)) continue;
        const parsed = JSON.parse(fs.readFileSync(passfile, 'utf8'));
        if (parsed && parsed[this.laneId]) {
          const val = parsed[this.laneId];
          this._passphraseSource = 'passfile';
          return typeof val === 'object' && val.passphrase ? val.passphrase : val;
        }
      } catch (_) {}
    }

    this._passphraseSource = null;
    return null;
  }

  _updateTrustStores(publicKey, keyId) {
    const trustStoreDirs = [
      'S:/Archivist-Agent/lanes/broadcast',
      'S:/self-organizing-library/lanes/broadcast',
      'S:/kernel-lane/lanes/broadcast',
    ];
    if (this.identityDir.includes('SwarmMind')) {
      trustStoreDirs.push('S:/SwarmMind/lanes/broadcast');
    }

    let updated = 0;
    for (const dir of trustStoreDirs) {
      const tsPath = path.join(dir, 'trust-store.json');
      try {
        if (!fs.existsSync(tsPath)) continue;
      let ts;
      try {
        ts = JSON.parse(fs.readFileSync(tsPath, 'utf8'));
      } catch (_) {
        continue;
      }
        if (ts && typeof ts === 'object') {
          ts[this.laneId] = {
            lane_id: this.laneId,
            public_key_pem: publicKey,
            algorithm: 'RS256',
            key_id: keyId,
            registered_at: new Date().toISOString(),
            expires_at: null,
            revoked_at: null,
          };
        fs.writeFileSync(tsPath, JSON.stringify(ts, null, 2));
        updated++;
      }
      } catch (_) {}
    }

    if (updated > 0) {
      this._log('INFO', `trust stores updated: ${updated} lanes`);
    }
    return updated > 0;
  }
}

function healLaneIdentity(laneId, options = {}) {
  const healer = new IdentitySelfHealing({ laneId, ...options });
  return healer.check();
}

module.exports = { IdentitySelfHealing, healLaneIdentity };

if (require.main === module) {
  const lane = process.argv[2] || process.env.LANE_NAME || 'unknown';
  const result = healLaneIdentity(lane);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.keysPresent ? 0 : 1);
}
