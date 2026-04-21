#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const CANONICAL_INBOX = {
  archivist: 'S:/Archivist-Agent/lanes/archivist/inbox/',
  library: 'S:/self-organizing-library/lanes/library/inbox/',
  swarmmind: 'S:/SwarmMind Self-Optimizing Multi-Agent AI System/lanes/swarmmind/inbox/',
  kernel: 'S:/kernel-lane/lanes/kernel/inbox/',
};

const LOCAL_BASE = path.join(__dirname, '..', 'lanes');

const VALID_LANES = new Set(Object.keys(CANONICAL_INBOX));

/**
 * DeliveryVerifier — validates that outbox messages were actually delivered
 * to the target lane's canonical inbox path, detecting mirror-only deliveries
 * (the biggest coordination integrity leak).
 */
class DeliveryVerifier {
  /**
   * @param {object} [overrides]
   */
  constructor(overrides = {}) {
    this.outboxPath = overrides.outboxPath
      || path.join(LOCAL_BASE, 'swarmmind', 'outbox');
    this.localBase = overrides.localBase || LOCAL_BASE;
    this.canonicalInbox = overrides.canonicalInbox || CANONICAL_INBOX;
  }

  /**
   * Run the full delivery verification.
   *
   * @returns {{ total_outbox: number, delivered: number, mirror_only: number, missing: number, details: Array<object> }}
   */
  verify() {
    const outboxFiles = this._listJsonFiles(this.outboxPath);
    const details = [];
    let delivered = 0;
    let mirrorOnly = 0;
    let missing = 0;

    for (const file of outboxFiles) {
      const filePath = path.join(this.outboxPath, file);
      const msg = this._readJson(filePath);
      if (!msg) continue;

      const toLane = msg.to_lane || msg.to || '';
      const messageId = msg.message_id || msg.id || '';

      if (!VALID_LANES.has(toLane)) {
        details.push({
          message_id: messageId,
          to_lane: toLane,
          status: 'UNKNOWN_LANE',
          canonical_path: this.canonicalInbox[toLane] || '(none)',
          found_at: null,
        });
        missing++;
        continue;
      }

      const canonicalPath = this.canonicalInbox[toLane];
      const canonicalFound = this._findMessageId(canonicalPath, messageId);

      if (canonicalFound) {
        details.push({
          message_id: messageId,
          to_lane: toLane,
          status: 'DELIVERED',
          canonical_path: canonicalPath,
          found_at: canonicalFound,
        });
        delivered++;
      } else {
        const mirrorPath = path.join(this.localBase, toLane, 'inbox');
        const mirrorFound = this._findMessageId(mirrorPath, messageId);

        if (mirrorFound) {
          details.push({
            message_id: messageId,
            to_lane: toLane,
            status: 'MIRROR_ONLY',
            canonical_path: canonicalPath,
            found_at: mirrorFound,
          });
          mirrorOnly++;
        } else {
          details.push({
            message_id: messageId,
            to_lane: toLane,
            status: 'MISSING',
            canonical_path: canonicalPath,
            found_at: null,
          });
          missing++;
        }
      }
    }

    return {
      total_outbox: outboxFiles.length,
      delivered,
      mirror_only: mirrorOnly,
      missing,
      details,
    };
  }

  /**
   * Scan local mirror directories for messages that exist in the mirror
   * but NOT in the canonical target inbox. These are mirror-only deliveries
   * leaked from any lane, not just this one.
   *
   * @returns {Array<{filename: string, mirror_path: string, canonical_path: string, to_lane: string}>}
   */
  scanMirrorLeaks() {
    const leaks = [];
    const mirrorLanes = VALID_LANES;

    for (const lane of mirrorLanes) {
      if (lane === 'swarmmind') continue;

      const mirrorDir = path.join(this.localBase, lane, 'inbox');
      const canonicalDir = this.canonicalInbox[lane];
      const mirrorFiles = this._listJsonFiles(mirrorDir);

      for (const file of mirrorFiles) {
        if (file.startsWith('heartbeat-')) continue;
        if (file === 'heartbeat.json') continue;
        if (file === 'watcher.log') continue;

        const mirrorPath = path.join(mirrorDir, file);
        const canonicalFilePath = path.join(canonicalDir, file);
        const canonicalProcessedPath = path.join(canonicalDir, 'processed', file);

        const inCanonical = fs.existsSync(canonicalFilePath) || fs.existsSync(canonicalProcessedPath);

        if (!inCanonical) {
          const msg = this._readJson(mirrorPath);
          const messageId = msg ? (msg.message_id || msg.id || file.replace(/\.json$/, '')) : file.replace(/\.json$/, '');

          leaks.push({
            filename: file,
            message_id: messageId,
            mirror_path: mirrorPath,
            canonical_path: canonicalDir,
            to_lane: lane,
          });
        }
      }
    }

    return leaks;
  }

  // ---------------------------------------------------------------------------
  // File helpers
  // ---------------------------------------------------------------------------

  /**
   * List .json files in a directory (non-recursive).
   *
   * @param {string} dirPath
   * @returns {string[]}
   */
  _listJsonFiles(dirPath) {
    try {
      return fs.readdirSync(dirPath).filter((f) => f.endsWith('.json'));
    } catch (_) {
      return [];
    }
  }

  /**
   * Search a directory and its processed/ subdirectory for a file
   * whose contents contain the given message_id.
   *
   * @param {string} dirPath - Directory to search
   * @param {string} messageId - message_id to look for
   * @returns {string|null} - Full path where found, or null
   */
  _findMessageId(dirPath, messageId) {
    if (!messageId) return null;

    const locations = [
      dirPath,
      path.join(dirPath, 'processed'),
    ];

    for (const loc of locations) {
      const files = this._listJsonFiles(loc);
      for (const file of files) {
        const msg = this._readJson(path.join(loc, file));
        if (!msg) continue;

        const id = msg.message_id || msg.id || '';
        if (id === messageId) {
          return path.join(loc, file);
        }
      }
    }

    return null;
  }

  /**
   * Read and parse a JSON file, returning null on any error.
   *
   * @param {string} filePath
   * @returns {object|null}
   */
  _readJson(filePath) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }
}

// -----------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------

if (require.main === module) {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const quietMode = args.includes('--quiet');

  const verifier = new DeliveryVerifier();
  const report = verifier.verify();
  const mirrorLeaks = verifier.scanMirrorLeaks();

  const exitCode = (report.mirror_only > 0 || report.missing > 0) ? 1 : 0;

  if (jsonMode) {
    const full = {
      ...report,
      mirror_leaks: mirrorLeaks,
    };
    console.log(JSON.stringify(full, null, 2));
    process.exit(exitCode);
  }

  if (!quietMode) {
    console.log('=== Cross-Lane Delivery Verification ===');
    console.log(`Outbox path:  ${verifier.outboxPath}`);
    console.log(`Total outbox: ${report.total_outbox}`);
    console.log(`Delivered:    ${report.delivered}`);
    console.log(`Mirror-only:  ${report.mirror_only}`);
    console.log(`Missing:      ${report.missing}`);
    console.log('');

    if (report.details.length > 0) {
      console.log('--- Outbox Delivery Details ---');
      for (const d of report.details) {
        const tag = d.status === 'DELIVERED' ? 'OK' : d.status;
        console.log(`  [${tag}] ${d.message_id} → ${d.to_lane}`);
        if (d.status !== 'DELIVERED' && d.found_at) {
          console.log(`         found at: ${d.found_at}`);
        }
        if (d.status !== 'DELIVERED') {
          console.log(`         canonical: ${d.canonical_path}`);
        }
      }
      console.log('');
    }

    if (mirrorLeaks.length > 0) {
      console.log('--- Mirror-Only Leaks (messages in local mirror but NOT canonical) ---');
      for (const leak of mirrorLeaks) {
        console.log(`  [LEAK] ${leak.message_id} → ${leak.to_lane}`);
        console.log(`         mirror:    ${leak.mirror_path}`);
        console.log(`         canonical: ${leak.canonical_path}`);
      }
      console.log('');
    }

    if (exitCode === 0) {
      console.log('Result: ALL DELIVERED');
    } else {
      console.log('Result: INTEGRITY ISSUES DETECTED');
    }
  }

  process.exit(exitCode);
}

module.exports = DeliveryVerifier;
