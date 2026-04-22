#!/usr/bin/env node
/**
 * atomic-write-util.js
 * 
 * Unified atomic write utilities with mandatory lease enforcement.
 * All lane write operations should use these functions to prevent collisions.
 * 
 * Usage:
 *   const { atomicWriteJson, atomicWriteWithLease } = require('./atomic-write-util');
 */

const fs = require('fs');
const path = require('path');
const { acquireLease, releaseLease, isLocked } = require('./file-lease-manager');

/**
 * Atomic write using temp file + rename (call without lease if caller holds lease)
 */
function atomicWriteJson(filePath, data, options = {}) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  fs.writeFileSync(tmp, content + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
  if (options.verify !== false && !fs.existsSync(filePath)) {
    throw new Error(`WRITE_VERIFICATION_FAILED: ${filePath}`);
  }
  return filePath;
}

/**
 * Atomic write with automatic lease acquisition and release.
 * This is the preferred method for all cross-lane writes.
 * 
 * @param {string} filePath - Target file path
 * @param {object|string} data - Data to write
 * @param {string} laneName - Lane acquiring the lease
 * @param {number} timeoutMs - Lease timeout (default 30s)
 * @returns {object} Result with path and lease info
 */
async function atomicWriteWithLease(filePath, data, laneName, timeoutMs = 30000) {
  // Acquire exclusive lease
  let lease = null;
  try {
    lease = await acquireLease(filePath, laneName, timeoutMs);
  } catch (e) {
    throw new Error(`LEASE_ACQUISITION_FAILED: ${e.message} - concurrent write blocked`);
  }
  
  try {
    // Perform atomic write
    atomicWriteJson(filePath, data);
    return { ok: true, path: filePath, leased: true };
  } finally {
    // Always release lease
    if (lease) {
      await releaseLease(lease);
    }
  }
}

/**
 * Write to outbox with full collision protection.
 * Use this for all outbox message writes.
 */
async function atomicWriteOutbox(lane, filename, message, laneName, timeoutMs = 30000) {
  const LANE_ROOTS = {
    archivist: 'S:/Archivist-Agent',
    library: 'S:/self-organizing-library',
    swarmmind: 'S:/SwarmMind Self-Optimizing Multi-Agent AI System',
    kernel: 'S:/kernel-lane',
  };
  
  const root = LANE_ROOTS[lane];
  if (!root) {
    throw new Error(`UNKNOWN_LANE: ${lane}`);
  }
  
  const outboxPath = path.join(root, 'lanes', lane, 'outbox', filename);
  return atomicWriteWithLease(outboxPath, message, laneName, timeoutMs);
}

module.exports = {
  atomicWriteJson,
  atomicWriteWithLease,
  atomicWriteOutbox,
  isLocked,
};
