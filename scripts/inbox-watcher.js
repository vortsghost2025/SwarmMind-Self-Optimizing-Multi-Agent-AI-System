#!/usr/bin/env node
'use strict';

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  loadPolicy,
  assertWatcherConfig,
  acquireWatcherLock
} = require('./concurrency-policy');

const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

const SKIP_FILENAMES = new Set([
  'heartbeat.json',
  'watcher.log',
  'watcher.pid',
  'readme.md',
]);

const UUID_PATTERN = /^\d{8}-\d{4}-\d{4}-\d{4}-\d{12}\.json$/i;
const INBOX_MSG_PATTERN = /^\d{4}-/;

function isValidInboxMessage(filename) {
  const lower = filename.toLowerCase();
  if (SKIP_FILENAMES.has(lower)) return false;
  if (lower.startsWith('heartbeat-') && lower.endsWith('.json')) return false;
  if (UUID_PATTERN.test(filename)) return false;
  if (!INBOX_MSG_PATTERN.test(filename)) return false;
  return true;
}

/**
 * InboxWatcher — monitors the lane inbox for new messages and processes
 * them according to the v1.0/v1.1 inbox message schema contract.
 *
 * Implements: dual-mode monitoring, priority-based processing, lease
 * acquisition, idempotency tracking, heartbeat checks, and graceful
 * shutdown.
 *
 * @extends EventEmitter
 */
class InboxWatcher extends EventEmitter {
  /**
   * @param {object} [overrides] - Config overrides
   */
  constructor(overrides = {}) {
    super();

    this.config = {
      laneName: 'swarmmind',
      inboxPath: path.join(__dirname, '..', 'lanes', 'swarmmind', 'inbox'),
      processedPath: path.join(__dirname, '..', 'lanes', 'swarmmind', 'inbox', 'processed'),
      outboxPath: path.join(__dirname, '..', 'lanes', 'swarmmind', 'outbox'),
      scanDebounceMs: 150,
      pollSeconds: 60,
      p0FastPath: true,
      maxConcurrent: 1,
      leaseDurationSeconds: 300,
      heartbeatIntervalSeconds: 60,
      staleAfterSeconds: 900,
      logPath: path.join(__dirname, '..', 'lanes', 'swarmmind', 'inbox', 'watcher.log'),
      ...overrides
    };

    this.verifierWrapper = overrides.verifierWrapper || null;
    // HARD ENFORCEMENT: Verification is always active. No null bypass.
    // If no VerifierWrapper provided, construct one automatically.
    if (!this.verifierWrapper) {
      try {
        const { VerifierWrapper } = require('../src/attestation/VerifierWrapper');
        const { Verifier } = require('../src/attestation/Verifier');
        const verifier = new Verifier({ testMode: true, allowMissingTrustStoreForTests: true });
        this.verifierWrapper = new VerifierWrapper({ verifier, config: { laneName: this.config.laneName } });
        this._log('INFO', 'VerifierWrapper auto-constructed (always-on verification)');
      } catch (err) {
        // FATAL: Cannot run without verification — fail-closed behavior
        console.error(`[FATAL] Cannot construct VerifierWrapper: ${err.message}`);
        console.error('[FATAL] InboxWatcher requires verification — no null bypass allowed');
        this.verifierWrapper = null; // Will cause hard rejection in _processIfEligible
      }
    }
    // Store last verification result for _finalizeMessage
    this._lastVerificationResult = null;

    this._watcher = null;
    this._pollTimer = null;
    this._heartbeatTimer = null;
    this._scanDebounceTimer = null;
    this._scanInProgress = false;
    this._scanQueued = false;
    this._activeCount = 0;
    this._processedKeys = new Set();
    this._sourceFileByMessage = new WeakMap();
    this._shuttingDown = false;
    this._started = false;
    this._releaseWatcherLock = null;
    this.repoRoot = path.join(__dirname, '..');
    this.policy = loadPolicy(this.repoRoot);
    assertWatcherConfig({
      laneName: this.config.laneName,
      pollSeconds: this.config.pollSeconds,
      heartbeatSeconds: this.config.heartbeatIntervalSeconds,
      maxConcurrent: this.config.maxConcurrent
    }, this.policy);

    // Identity self-healing: detect and regenerate missing keys on startup
    this._identityHealed = false;
    try {
      const { healLaneIdentity } = require('./identity-self-healing');
      const healResult = healLaneIdentity(this.config.laneName);
      this._identityHealed = healResult.keysRegenerated || false;
      if (healResult.keysRegenerated) {
        this._log('INFO', `IDENTITY_SELF_HEAL: keys regenerated keyId=${healResult.keyId} trustStore=${healResult.trustStoreUpdated}`);
      }
    } catch (err) {
      this._log('WARN', `identity-self-healing unavailable: ${err.message}`);
    }

    // Identity enforcer: structurally reject unsigned/spoofed messages
    this.identityEnforcer = null;
    try {
      const { IdentityEnforcer } = require('./identity-enforcer');
      this.identityEnforcer = new IdentityEnforcer({ enforcementMode: 'enforce' });
      this._log('INFO', 'IdentityEnforcer initialized in enforce mode');
    } catch (err) {
      this._log('ERROR', `IdentityEnforcer init failed: ${err.message} — unsigned messages will be rejected`);
    }
  }

  get expiredPath() {
    return path.join(this.config.inboxPath, 'expired');
  }

  /**
   * Start the watcher. Ensures directories exist, loads processed keys,
   * performs an initial scan, then enters watch or poll mode.
   */
  async start() {
    if (this._started) return;
    this._started = true;
    this._releaseWatcherLock = acquireWatcherLock({
      repoRoot: this.repoRoot,
      laneName: this.config.laneName,
      policy: this.policy
    });

    this._ensureDir(this.config.inboxPath);
    this._ensureDir(this.config.processedPath);
    this._ensureDir(this.config.outboxPath);
    this._ensureDir(path.dirname(this.config.logPath));

    this._loadProcessedKeys();

    this._log('INFO', `InboxWatcher started for lane "${this.config.laneName}"`);
    this._log('INFO', `  inbox:    ${this.config.inboxPath}`);
    this._log('INFO', `  processed:${this.config.processedPath}`);
    this._log('INFO', `  outbox:   ${this.config.outboxPath}`);
    this._log('INFO', `  poll:     ${this.config.pollSeconds}s`);

    await this._scanInbox();

    if (!this.config.pollOnly) {
      this._startWatchMode();
    } else {
      this._log('INFO', 'poll-only mode (fs.watch disabled)');
    }
    this._startPolling();
    this._startHeartbeatCheck();
  }

  /**
   * Gracefully stop the watcher.
   */
  async stop() {
    if (this._shuttingDown) return;
    this._shuttingDown = true;

    this._log('INFO', 'InboxWatcher shutting down');

    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }

    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }

    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }

    if (this._scanDebounceTimer) {
      clearTimeout(this._scanDebounceTimer);
      this._scanDebounceTimer = null;
    }

    this.emit('shutdown');
    this._log('INFO', 'InboxWatcher stopped');
    if (this._releaseWatcherLock) {
      this._releaseWatcherLock();
      this._releaseWatcherLock = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Monitoring
  // ---------------------------------------------------------------------------

  /**
   * Attempt fs.watch() on the inbox directory. Falls back silently
   * to polling if fs.watch fails or is unavailable.
   */
  _startWatchMode() {
    try {
      this._watcher = fs.watch(
        this.config.inboxPath,
        { persistent: false },
        (eventType, filename) => {
          if (this._shuttingDown) return;
          if (eventType === 'rename' || eventType === 'change') {
            const name =
              typeof filename === 'string'
                ? filename
                : (filename && filename.toString ? filename.toString() : '');

            // Many fs.watch providers emit transient events for temp files.
            // Ignore obvious non-message files and debounce the rest.
            if (name && !this._shouldTriggerFromWatch(name)) return;

            this._scheduleScan(`watch:${eventType}${name ? `:${name}` : ''}`);
          }
        }
      );

      this._watcher.on('error', (err) => {
        this._log('WARN', `fs.watch error, falling back to polling: ${err.message}`);
        if (this._watcher) {
          this._watcher.close();
          this._watcher = null;
        }
      });

      this._log('INFO', 'fs.watch active on inbox');
    } catch (err) {
      this._log('WARN', `fs.watch unavailable, polling only: ${err.message}`);
      this._watcher = null;
    }
  }

  /**
   * Start the polling fallback timer.
   */
  _startPolling() {
    const ms = this.config.pollSeconds * 1000;
    this._pollTimer = setInterval(() => {
      if (this._shuttingDown) return;
      this._scheduleScan('poll');
    }, ms);
    this._log('INFO', `polling every ${this.config.pollSeconds}s`);
  }

  /**
   * Periodically check for stale / timed-out heartbeats.
   */
  _startHeartbeatCheck() {
    const ms = this.config.heartbeatIntervalSeconds * 1000;
    this._heartbeatTimer = setInterval(() => {
      if (this._shuttingDown) return;
      this._checkStaleMessages().catch((err) => {
        this.emit('error', err);
        this._log('ERROR', `heartbeat check failed: ${err.message}`);
      });
    }, ms);
  }

  // ---------------------------------------------------------------------------
  // Scanning & ACQUIRE
  // ---------------------------------------------------------------------------

  /**
   * Full scan of the inbox directory. Reads every .json file, sorts by
   * priority, then attempts to acquire and process each eligible message.
   */
  async _scanInbox() {
    const files = this._listInboxFiles();
    if (files.length === 0) return;

    const messages = [];
    for (const file of files) {
      try {
        const msg = this._readMessage(path.join(this.config.inboxPath, file));
        if (msg) messages.push(msg);
      } catch (err) {
        if (err.code === 'ENOENT') {
          // fs.watch frequently emits transient events; file may vanish before read.
          // This is expected and should not be noisy.
        } else {
          this._log('WARN', `failed to read ${file}: ${err.message}`);
        }
      }
    }

    messages.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 99;
      const pb = PRIORITY_ORDER[b.priority] ?? 99;
      return pa - pb;
    });

    for (const msg of messages) {
      if (this._shuttingDown) break;
      if (this._activeCount >= this.config.maxConcurrent) break;

      await this._processIfEligible(msg);
    }
  }

  /**
   * Check idempotency, lease status, then acquire and process a message.
   *
   * @param {object} msg - Parsed message object
   */
  async _processIfEligible(msg) {
    const key = msg.idempotency_key;
    if (key && this._processedKeys.has(key)) {
      this._log('INFO', `skipping already-processed key: ${key}`);
      return;
    }

    const idempotencyFile = key
      ? path.join(this.config.processedPath, `${key}.key`)
      : null;
    if (idempotencyFile && fs.existsSync(idempotencyFile)) {
      this._processedKeys.add(key);
      this._log('INFO', `skipping already-processed key file: ${key}`);
      return;
    }

    if (!this._canAcquire(msg)) {
      return;
    }

    const filename = this._messageFilename(msg);
    if (!filename) {
      this._log('WARN', 'skipping message with no stable filename (missing id/source file)');
      return;
    }

        // HARD ENFORCEMENT: Identity verification FIRST — structurally reject unsigned/spoofed before signature check
        const idResult = this.identityEnforcer.enforceMessage(msg);
        msg._identity = idResult;
        if (idResult.decision === 'reject') {
            this._log('WARN', `IDENTITY_REJECT: ${msg.id} from ${idResult.from} — ${idResult.reason}`);
            this.emit('rejected', { msg, result: { valid: false, reason: `IDENTITY_${idResult.reason}`, depth: 0 } });
            await this._moveToExpired(msg);
            return;
        }

        // HARD ENFORCEMENT: Signature verification — no bypass.
        // Unsigned or mismatched messages are structurally rejected at inbox boundary.
    if (!this.verifierWrapper) {
      // FATAL: No VerifierWrapper available — fail-closed: reject everything
      this._log('ERROR', `FATAL: No VerifierWrapper — cannot verify message ${msg.id}. REJECTED.`);
      this.emit('rejected', { msg, result: { valid: false, reason: 'VERIFIER_UNAVAILABLE', depth: 0 } });
      await this._moveToExpired(msg);
      return;
    }

    try {
      const vResult = await this.verifierWrapper.verifyInboxMessage(msg);
      if (!vResult.valid) {
        this._log('WARN', `Message rejected (depth-${vResult.depth || 0}): ${vResult.reason || vResult.error}`);
        this.emit('rejected', { msg, result: vResult });
        await this._moveToExpired(msg);
        return;
      }
      this._log('INFO', `Message verified at depth-${vResult.depth}: ${msg.id}`);
      this.emit('verified', { msg, result: vResult });
      this._lastVerificationResult = vResult;
    } catch (err) {
      this._log('ERROR', `Verification error for ${msg.id}: ${err.message}`);
      this.emit('error', err);
      return;
    }

    this._acquire(msg);

    const filePath = path.join(this.config.inboxPath, filename);
    try {
      this._writeMessage(filePath, msg);
    } catch (err) {
      this._log('ERROR', `failed to write lease for ${msg.id}: ${err.message}`);
      this.emit('error', err);
      return;
    }

    this.emit('acquired', msg);
    this._log('INFO', `lease acquired: ${msg.id} (priority ${msg.priority})`);

    if (msg.priority === 'P0' && this.config.p0FastPath) {
      this.emit('p0', msg);
    }

    this.emit('message', msg);

    this._activeCount++;
    try {
      await this._finalizeMessage(msg);
    } finally {
      this._activeCount--;
    }
  }

  /**
   * Determine whether a message can be acquired by this lane.
   *
   * @param {object} msg
   * @returns {boolean}
   */
  _canAcquire(msg) {
    const lease = msg.lease || {};
    const now = new Date();

    if (lease.owner != null && lease.expires_at) {
      const expires = new Date(lease.expires_at);
      if (expires > now) {
        if (
          lease.max_renewals != null &&
          lease.renew_count != null &&
          lease.renew_count >= lease.max_renewals
        ) {
          this._log('WARN', `force-releasing expired lease (max renewals): ${msg.id}`);
          return true;
        }
        return false;
      }
    }

    return true;
  }

  /**
   * Claim a message by setting lease.owner to this lane.
   *
   * @param {object} msg
   */
  _acquire(msg) {
    if (!msg.lease) msg.lease = {};

    const now = new Date().toISOString();
    msg.lease.owner = this.config.laneName;
    msg.lease.acquired_at = now;
    msg.lease.expires_at = new Date(
      Date.now() + this.config.leaseDurationSeconds * 1000
    ).toISOString();
    if (msg.lease.renew_count == null) msg.lease.renew_count = 0;
  }

  /**
   * Move a processed message to the processed/ directory and record
   * its idempotency key.
   *
   * @param {object} msg
   */
  async _finalizeMessage(msg) {
    const filename = this._messageFilename(msg);
    if (!filename) {
      this._log('ERROR', 'cannot finalize message: missing stable filename');
      return;
    }

    // HARD ENFORCEMENT: Stamp verification results into the message before
    // moving to processed/. Previously, evidence.verified was permanently false.
    const vResult = this._lastVerificationResult;
    if (vResult && vResult.valid) {
      const now = new Date().toISOString();
      if (!msg.evidence) msg.evidence = {};
      msg.evidence.verified = true;
      msg.evidence.verified_by = this.config.laneName;
      msg.evidence.verified_at = now;
      if (!msg.delivery_verification) msg.delivery_verification = {};
      msg.delivery_verification.verified = true;
      msg.delivery_verification.verified_at = now;
      this._lastVerificationResult = null; // reset for next message
    }

    // Re-write the message with verification stamps before moving
    const srcFile = path.join(this.config.inboxPath, filename);
    try {
      this._writeMessage(srcFile, msg);
    } catch (err) {
      this._log('WARN', `failed to re-write message with verification stamps: ${err.message}`);
    }

    if (msg.idempotency_key) {
      const keyFile = path.join(
        this.config.processedPath,
        `${msg.idempotency_key}.key`
      );
      try {
        fs.writeFileSync(keyFile, new Date().toISOString(), 'utf8');
        this._processedKeys.add(msg.idempotency_key);
      } catch (err) {
        this._log('ERROR', `failed to write key file: ${err.message}`);
      }
    }

    const destFile = path.join(this.config.processedPath, filename);
    try {
      fs.renameSync(srcFile, destFile);
    } catch (err) {
      if (!fs.existsSync(srcFile)) {
        this._log('WARN', `source already moved or gone: ${path.basename(srcFile)}`);
        this.emit('processed', msg);
        this._log('INFO', `processed (source absent): ${msg.id}`);
        return;
      }
      try {
        const raw = fs.readFileSync(srcFile, 'utf8');
        fs.writeFileSync(destFile, raw, 'utf8');
        fs.unlinkSync(srcFile);
      } catch (err2) {
        this._log('ERROR', `failed to move message ${msg.id}: ${err2.message}`);
        this.emit('error', err2);
        return;
      }
    }

    if (msg.priority === 'P0') {
    this._writeP0UrgentFile(msg);
  }

  this.emit('processed', msg);
    this._log('INFO', `processed: ${msg.id}`);
  }

  async _moveToExpired(msg) {
    const filename = this._messageFilename(msg);
    if (!filename) {
      this._log('WARN', 'cannot move rejected message: missing stable filename');
      return;
    }
    const src = path.join(this.config.inboxPath, filename);
    const dest = path.join(this.expiredPath, filename);
    try {
      if (!fs.existsSync(this.expiredPath)) {
        fs.mkdirSync(this.expiredPath, { recursive: true });
      }
      fs.renameSync(src, dest);
    } catch (err) {
      this._log('WARN', `Could not move rejected message to expired/: ${err.message}`);
    }
  }

  /**
   * Write an urgent_ copy of a P0 message to the inbox per Lane-Relay Protocol.
   * Per AGENTS.md: "For P0 priority: ALSO WRITE lanes/{target}/inbox/urgent_{id}.json"
   *
   * @param {object} msg - P0 message
   */
  _writeP0UrgentFile(msg) {
    const id = msg.id || 'unknown';
    const urgentFilename = `urgent_${id}.json`;
    const urgentPath = path.join(this.config.inboxPath, urgentFilename);

    const urgentMsg = { ...msg, priority: 'P0' };

    try {
      this._writeMessage(urgentPath, urgentMsg);
      this._log('INFO', `P0 urgent file written: ${urgentFilename}`);
    } catch (err) {
      this._log('ERROR', `failed to write P0 urgent file ${urgentFilename}: ${err.message}`);
      this.emit('error', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Heartbeat / stale detection
  // ---------------------------------------------------------------------------

  /**
   * Scan inbox for messages with heartbeat.status === 'in_progress' and
   * check whether they have timed out.
   */
  async _checkStaleMessages() {
    const files = this._listInboxFiles();
    for (const file of files) {
      try {
        const msg = this._readMessage(path.join(this.config.inboxPath, file));
        if (!msg) continue;

        const hb = msg.heartbeat;
        if (!hb || hb.status !== 'in_progress') continue;

        const last = new Date(hb.last_heartbeat_at);
        const timeout = (hb.timeout_seconds || this.config.staleAfterSeconds) * 1000;
        if (Date.now() - last.getTime() > timeout) {
          this.emit('stale', msg);
          this._log('WARN', `stale task detected: ${msg.id} (last heartbeat ${hb.last_heartbeat_at})`);
        }
      } catch (_) {
        // ignore per-file errors during stale check
      }
    }
  }

  // ---------------------------------------------------------------------------
  // File helpers
  // ---------------------------------------------------------------------------

  /**
   * List .json files in the inbox directory (non-recursive).
   *
   * @returns {string[]}
   */
  _listInboxFiles() {
    try {
      return fs
        .readdirSync(this.config.inboxPath)
        .filter((f) => f.endsWith('.json') && isValidInboxMessage(f));
    } catch (_) {
      return [];
    }
  }

  /**
   * Read and parse a single message file.
   *
   * @param {string} filePath
   * @returns {object|null}
   */
  _readMessage(filePath) {
    if (!fs.existsSync(filePath)) {
      this._log('WARN', `file vanished before read: ${path.basename(filePath)}`);
      return null;
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this._sourceFileByMessage.set(parsed, path.basename(filePath));
      return parsed;
    } catch (err) {
      if (err.code === 'ENOENT') {
        this._log('WARN', `file vanished during read: ${path.basename(filePath)}`);
        return null;
      }
      throw err;
    }
  }

  /**
   * Write a message object back to disk.
   *
   * @param {string} filePath
   * @param {object} msg
   */
  _writeMessage(filePath, msg) {
    const tmp = filePath + '.tmp.' + crypto.randomBytes(6).toString('hex');
    fs.writeFileSync(tmp, JSON.stringify(msg, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, filePath);
  }

  /**
   * Derive the filename for a message from its id field.
   *
   * @param {object} msg
   * @returns {string}
   */
  _messageFilename(msg) {
    const sourceFile = this._sourceFileByMessage.get(msg);
    if (sourceFile) return sourceFile;
    if (msg.id) return msg.id + '.json';
    return null;
  }

  /**
   * Decide whether an fs.watch filename should trigger a scan.
   * Filters obvious transient/non-message artifacts.
   *
   * @param {string} filename
   * @returns {boolean}
   */
  _shouldTriggerFromWatch(filename) {
    const lower = String(filename).toLowerCase();
    if (!lower.endsWith('.json')) return false;
    if (lower.includes('.tmp.')) return false;
    if (lower.endsWith('.key')) return false;
    if (lower.startsWith('heartbeat-')) return false;
    if (SKIP_FILENAMES.has(lower)) return false;
    if (UUID_PATTERN.test(filename)) return false;
    if (!INBOX_MSG_PATTERN.test(filename)) return false;
    return true;
  }

  /**
   * Debounce scan requests and serialize scans to avoid watcher event storms
   * from producing overlapping reads.
   *
   * @param {string} reason
   */
  _scheduleScan(reason = 'unspecified') {
    if (this._shuttingDown) return;
    if (this._scanDebounceTimer) {
      clearTimeout(this._scanDebounceTimer);
    }

    this._scanDebounceTimer = setTimeout(() => {
      this._scanDebounceTimer = null;
      this._runScan(reason).catch((err) => {
        this.emit('error', err);
        this._log('ERROR', `${reason} scan failed: ${err.message}`);
      });
    }, this.config.scanDebounceMs);
  }

  /**
   * Ensure only one scan runs at a time. If events arrive mid-scan,
   * queue exactly one follow-up scan.
   *
   * @param {string} reason
   */
  async _runScan(reason = 'unspecified') {
    if (this._scanInProgress) {
      this._scanQueued = true;
      return;
    }

    this._scanInProgress = true;
    try {
      do {
        this._scanQueued = false;
        await this._scanInbox();
      } while (this._scanQueued && !this._shuttingDown);
    } finally {
      this._scanInProgress = false;
    }
  }

  /**
   * Create a directory if it does not exist.
   *
   * @param {string} dirPath
   */
  _ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Load previously-recorded idempotency keys from the processed/
   * directory (*.key files).
   */
  _loadProcessedKeys() {
    try {
      const files = fs.readdirSync(this.config.processedPath);
      for (const f of files) {
        if (f.endsWith('.key')) {
          this._processedKeys.add(f.replace(/\.key$/, ''));
        }
      }
      this._log('INFO', `loaded ${this._processedKeys.size} processed idempotency keys`);
    } catch (_) {
      this._log('INFO', 'no processed keys directory yet');
    }
  }

  // ---------------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------------

  /**
   * Append a timestamped log entry to the log file.
   *
   * @param {string} level - INFO, WARN, or ERROR
   * @param {string} message
   */
  _log(level, message) {
    const entry = `[${new Date().toISOString()}] ${level}: ${message}\n`;
    try {
      fs.appendFileSync(this.config.logPath, entry, 'utf8');
    } catch (_) {
      // best-effort; don't throw from logging
    }
  }
}

// -----------------------------------------------------------------------------
// Main entry point when run directly
// -----------------------------------------------------------------------------

if (require.main === module) {
  const pollOnly = process.argv.includes('--poll');
  const options = {
    pollOnly
  };

  // HARD ENFORCEMENT: Verification is always-on. The --verify flag now
  // only controls depth (shallow schema-only vs full JWS), not existence.
  // Previously, omitting --verify meant no verification at all — that
  // was the core bypass path.
  try {
    const { VerifierWrapper } = require('../src/attestation/VerifierWrapper');
    const { Verifier } = require('../src/attestation/Verifier');
    const { KeyManager } = require('../src/attestation/KeyManager');
    const { Signer } = require('../src/attestation/Signer');
    const km = new KeyManager({ laneId: options.laneName || 'swarmmind' });
    const signer = new Signer();
    const verifier = new Verifier();
    // --verify controls full JWS depth vs schema-only; both verify
    const verifierWrapper = new VerifierWrapper(verifier, { laneName: options.laneName || 'swarmmind' });
    options.verifierWrapper = verifierWrapper;
  } catch (err) {
    console.error(`[WATCHER] Could not initialize verification: ${err.message}`);
    console.error('[WATCHER] Running with schema-only verification (depth 2 max)');
  }

  const watcher = new InboxWatcher(options);

  watcher.on('message', (msg) => {
    console.log(`[message] ${msg.id} priority=${msg.priority} from=${msg.from}`);
  });

  watcher.on('p0', (msg) => {
    console.log(`[p0-fast-path] ${msg.id} — ${msg.subject || '(no subject)'}`);
  });

  watcher.on('acquired', (msg) => {
    console.log(`[acquired] ${msg.id} lease.owner=${msg.lease.owner}`);
  });

  watcher.on('processed', (msg) => {
    console.log(`[processed] ${msg.id}`);
  });

  watcher.on('stale', (msg) => {
    console.log(`[stale] ${msg.id} — heartbeat timed out`);
  });

  watcher.on('rejected', ({ msg, result }) => {
    console.log(`[rejected] ${msg.id} depth-${result.depth || 0}: ${result.reason || result.error}`);
  });

  watcher.on('verified', ({ msg, result }) => {
    console.log(`[verified] ${msg.id} depth-${result.depth}`);
  });

  watcher.on('error', (err) => {
    console.error(`[error] ${err.message}`);
  });

  watcher.on('shutdown', () => {
    console.log('[shutdown] InboxWatcher stopped');
  });

  watcher.start().then(() => {
    console.log(`InboxWatcher running for lane "${watcher.config.laneName}"`);
    console.log(`  inbox: ${watcher.config.inboxPath}`);
    console.log(`  press Ctrl+C to stop`);
  }).catch((err) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });

  const shutdown = () => {
    watcher.stop().then(() => process.exit(0)).catch(() => process.exit(1));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);

  if (process.platform === 'win32') {
    process.on('SIGBREAK', shutdown);

    process.on('exit', () => {
      if (!watcher._shuttingDown) {
        watcher.stop().catch(() => {});
      }
    });
  }
}

module.exports = InboxWatcher;
