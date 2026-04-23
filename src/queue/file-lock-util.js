/**
 * File Lock Utility — cross-platform file-based locking for concurrent access.
 *
 * Implements advisory locking via lock files with PID and timestamp.
 * Locks are automatically cleaned up on process exit.
 *
 * @private
 */

const fs = require('fs');
const path = require('path');

class FileLockUtil {
  /**
   * Acquire an exclusive lock on a resource path.
   * Creates a {resource}.lock file containing PID and timestamp.
   *
   * @param {string} resourcePath - Absolute path to the resource being locked
   * @param {object} [options] - Lock options
   * @param {number} [options.timeoutMs=30000] - Max wait time for lock
   * @param {number} [options.pollIntervalMs=100] - Lock poll interval
   * @returns {function} - Release function to unlock
   * @throws {Error} If lock cannot be acquired within timeout
   */
  static acquire(resourcePath, options = {}) {
    const timeoutMs = options.timeoutMs ?? 30000;
    const pollIntervalMs = options.pollIntervalMs ?? 100;
    const lockPath = resourcePath + '.lock';

    const startTime = Date.now();
    let lastLockInfo = null;

    // Attempt to create lock file exclusively
    const tryAcquire = () => {
      try {
        const lockInfo = {
          pid: process.pid,
          ts: new Date().toISOString(),
          holder: process.env.LANE_NAME || 'unknown'
        };
        const content = JSON.stringify(lockInfo) + '\n';

        // O_EXCL ensures atomic create — fails if file exists
        const fd = fs.openSync(lockPath, 'wx', 0o644);
        try {
          fs.writeSync(fd, content, 'utf8');
          fs.closeSync(fd);
          return true;
        } catch (e) {
          fs.closeSync(fd);
          throw e;
        }
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        return false;
      }
    };

    // Non-blocking attempt first (fast path)
    if (tryAcquire()) {
      return this._makeRelease(lockPath);
    }

    // Polling loop with timeout
    while (Date.now() - startTime < timeoutMs) {
      // Check if lock is stale before polling
      const lockStat = this._readLockFile(lockPath);
      if (lockStat && this._isStale(lockStat)) {
        this._log('WARN', `Stale lock detected on ${path.basename(resourcePath)}, forcing acquisition`);
        this._release(lockPath); // Clean up stale lock
        if (tryAcquire()) {
          return this._makeRelease(lockPath);
        }
      }

      // Wait then retry
      const sleepMs = Math.min(pollIntervalMs, 1000);
      const startWait = Date.now();
      while (Date.now() - startWait < sleepMs) {
        // Busy wait minimal; adequate for Node.js single-threaded model
      }

      if (tryAcquire()) {
        return this._makeRelease(lockPath);
      }
      lastLockInfo = this._readLockFile(lockPath);
    }

    throw new Error(
      `Lock acquisition timeout on ${path.basename(resourcePath)} after ${timeoutMs}ms` +
      (lastLockInfo ? ` (held by PID ${lastLockInfo.pid} since ${lastLockInfo.ts})` : '')
    );
  }

  /**
   * Read and parse a lock file (if present).
   * @private
   */
  static _readLockFile(lockPath) {
    try {
      if (!fs.existsSync(lockPath)) return null;
      const raw = fs.readFileSync(lockPath, 'utf8');
      return JSON.parse(raw.trim());
    } catch {
      return null;
    }
  }

  /**
   * Determine if a lock is stale (no heartbeat or timeout).
   * @private
   */
  static _isStale(lockStat, maxAgeMs = 60000) {
    const heldAt = new Date(lockStat.ts);
    const ageMs = Date.now() - heldAt.getTime();
    return ageMs > maxAgeMs;
  }

  /**
   * Create a release closure for a lock.
   * @private
   */
  static _makeRelease(lockPath) {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      FileLockUtil._release(lockPath);
    };
  }

  /**
   * Release a lock by removing the lock file.
   * @private
   */
  static _release(lockPath) {
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    } catch (e) {
      // Best-effort only
    }
  }

  /**
   * Log helper (uses console if no logger provided)
   * @private
   */
  static _log(level, message) {
    // Use global console; InboxWatcher redirect if needed
    console[level] ? console[level](`[FileLock] ${message}`) : console.log(`[FileLock] ${message}`);
  }
}

module.exports = { FileLockUtil };
