#!/usr/bin/env node
/**
 * file-lease-manager.js
 * 
 * File-level lease system for preventing concurrent edits.
 * - Acquires lock before editing
 * - Detects concurrent modifications  
 * - Blocks on collision
 * - Prevents race conditions
 * 
 * Usage:
 *   const lock = await acquireLease('path/to/file.json', 'archivist');
 *   // DO WORK
 *   await releaseLease(lock);
 */

const fs = require('fs');
const path = require('path');

const LOCK_DIR = 'S:/kernel-lane/lanes/broadcast/.leases';
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes default
const LOCK_CHECK_INTERVAL_MS = 5000; // Check every 5 seconds

/**
 * Ensure lock directory exists
 */
function ensureLockDir() {
  if (!fs.existsSync(LOCK_DIR)) {
    fs.mkdirSync(LOCK_DIR, { recursive: true });
  }
}

/**
 * Get lock file path for a target file
 */
function getLockPath(targetPath) {
  const key = targetPath.replace(/[:/\\]/g, '_');
  return path.join(LOCK_DIR, `${key}.lock`);
}

/**
 * Atomic acquire using exclusive flag - prevents TOCTOU race
 * Uses 'wx' flag which fails if file exists (atomic)
 */
async function acquireLeaseAtomic(targetPath, laneName, timeoutMs = LOCK_TTL_MS) {
  ensureLockDir();
  
  const lockPath = getLockPath(targetPath);
  const startTime = Date.now();
  
  while (true) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`LEASE_TIMEOUT: Could not acquire lock on ${targetPath} after ${timeoutMs}ms`);
    }
    
    const lease = {
      target: targetPath,
      lane: laneName,
      acquired_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
      lock_file: lockPath
    };
    
    // ATOMIC: Use exclusive flag - fails if file exists
    try {
      fs.writeFileSync(lockPath, JSON.stringify(lease, null, 2), { flag: 'wx' });
      console.log(`[LEASE] ${laneName} acquired atomic lock on ${targetPath}`);
      return lease;
    } catch (e) {
      if (e.code !== 'EEXIST') {
        // Unexpected error - log and retry
        console.error(`[LEASE] Unexpected error: ${e.message}`);
      }
      // File exists - check if stale
    }
    
    // Check existing lock for staleness
    try {
      const existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      const expires = new Date(existing.expires_at).getTime();
      
      if (Date.now() > expires) {
        // Stale - try to remove and retry
        try { fs.unlinkSync(lockPath); } catch {}
        console.log(`[LEASE] Removed stale lock on ${targetPath}`);
        continue;
      }
      
      if (existing.lane === laneName) {
        // Same lane - extend
        existing.expires_at = new Date(Date.now() + LOCK_TTL_MS).toISOString();
        try {
          fs.writeFileSync(lockPath, JSON.stringify(existing, null, 2), { flag: 'w' });
          console.log(`[LEASE] ${laneName} extended lock on ${targetPath}`);
          return existing;
        } catch {}
      }
      
      // Different lane holds lock
      console.log(`[LEASE] ${laneName} waiting for ${existing.lane} on ${targetPath}`);
    } catch {
      // Corrupted lock file - retry acquisition
    }
    
    await new Promise(r => setTimeout(r, LOCK_CHECK_INTERVAL_MS));
  }
}

/**
 * Acquire lease on a file - blocks if another lane holds it
 * 
 * @param {string} targetPath - File to lock
 * @param {string} laneName - Lane requesting lock
 * @param {number} timeoutMs - Max wait time (default 5 min)
 * @returns {Object} Lease object or throws
 */
async function acquireLease(targetPath, laneName, timeoutMs = LOCK_TTL_MS) {
  ensureLockDir();
  
  const lockPath = getLockPath(targetPath);
  const startTime = Date.now();
  
  while (true) {
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`LEASE_TIMEOUT: Could not acquire lock on ${targetPath} after ${timeoutMs}ms`);
    }
    
    // Try to acquire lock
    if (!fs.existsSync(lockPath)) {
      const lease = {
        target: targetPath,
        lane: laneName,
        acquired_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
        lock_file: lockPath
      };
      
      // Atomic write - create lock file
      fs.writeFileSync(lockPath, JSON.stringify(lease, null, 2));
      
      // Verify we got it (in case of race)
      const content = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (content.lane === laneName) {
        console.log(`[LEASE] ${laneName} acquired lock on ${targetPath}`);
        return lease;
      }
    }
    
    // Lock exists - check if it's stale
    try {
      const existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      const expires = new Date(existing.expires_at).getTime();
      
      if (Date.now() > expires) {
        // Stale lock - remove it
        fs.unlinkSync(lockPath);
        console.log(`[LEASE] Removed stale lock on ${targetPath}`);
        continue;
      }
      
      // Check if same lane (allow self to re-acquire)
      if (existing.lane === laneName) {
        // Extend lease
        existing.expires_at = new Date(Date.now() + LOCK_TTL_MS).toISOString();
        fs.writeFileSync(lockPath, JSON.stringify(existing, null, 2));
        console.log(`[LEASE] ${laneName} extended lock on ${targetPath}`);
        return existing;
      }
      
      // Different lane holds lock
      console.log(`[LEASE] ${laneName} waiting for ${existing.lane} on ${targetPath}`);
    } catch (e) {
      // Lock file corrupted - remove and retry
      try { fs.unlinkSync(lockPath); } catch {}
    }
    
    // Wait before retry
    await new Promise(r => setTimeout(r, LOCK_CHECK_INTERVAL_MS));
  }
}

/**
 * Release a lease
 */
async function releaseLease(lease) {
  if (!lease || !lease.lock_file) return;
  
  try {
    fs.unlinkSync(lease.lock_file);
    console.log(`[LEASE] ${lease.lane} released lock on ${lease.target}`);
  } catch (e) {
    // Lock may already be gone
  }
}

/**
 * Check if a file is locked
 */
function isLocked(targetPath) {
  const lockPath = getLockPath(targetPath);
  if (!fs.existsSync(lockPath)) return false;
  
  try {
    const existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const expires = new Date(existing.expires_at).getTime();
    
    if (Date.now() > expires) {
      fs.unlinkSync(lockPath);
      return false;
    }
    return existing;
  } catch {
    return false;
  }
}

/**
 * List all active leases
 */
function listLeases() {
  ensureLockDir();
  
  const files = fs.readdirSync(LOCK_DIR).filter(f => f.endsWith('.lock'));
  const leases = [];
  
  for (const file of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(LOCK_DIR, file), 'utf8'));
      const expires = new Date(content.expires_at).getTime();
      
      if (Date.now() < expires) {
        leases.push(content);
      } else {
        fs.unlinkSync(path.join(LOCK_DIR, file));
      }
    } catch {}
  }
  
  return leases;
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'list') {
    console.log('=== ACTIVE LEASES ===\n');
    const leases = listLeases();
    if (leases.length === 0) {
      console.log('No active leases');
    } else {
      for (const l of leases) {
        console.log(`${l.target}`);
        console.log(`  ${l.lane} until ${l.expires_at}`);
      }
    }
    process.exit(0);
  }
  
  if (command === 'check') {
    const target = args[1];
    if (!target) {
      console.log('Usage: node file-lease-manager.js check <file>');
      process.exit(1);
    }
    
    const locked = isLocked(target);
    if (locked) {
      console.log(`🔒 LOCKED: ${locked.lane}`);
      process.exit(1);
    } else {
      console.log('🔓 UNLOCKED');
      process.exit(0);
    }
  }
  
  if (command === 'acquire') {
    const target = args[1];
    const lane = args[2] || 'kernel';
    
    if (!target) {
      console.log('Usage: node file-lease-manager.js acquire <file> <lane>');
      process.exit(1);
    }
    
    try {
      const lease = await acquireLease(target, lane, 30000);
      console.log(`✅ ACQUIRED: ${target} by ${lane}`);
      
      // Hold for demo - then release
      setTimeout(async () => {
        await releaseLease(lease);
        process.exit(0);
      }, 10000);
    } catch (e) {
      console.log(`❌ FAILED: ${e.message}`);
      process.exit(1);
    }
    return;
  }
  
  console.log(`
file-lease-manager.js - Collision Prevention

Usage:
  node file-lease-manager.js list              # List active leases
  node file-lease-manager.js check <file>    # Check if file is locked
  node file-lease-manager.js acquire <file> <lane>  # Acquire lease (demo)

API:
  const lease = await acquireLease('file.json', 'archivist');
  // DO WORK
  await releaseLease(lease);
  `);
}

if (require.main === module) {
  main();
}

module.exports = { 
  acquireLease: acquireLeaseAtomic,  // Use atomic by default
  acquireLeaseLegacy: acquireLease,  // Keep old version for compatibility
  releaseLease, 
  isLocked, 
  listLeases,
  getLockPath,  // Required by edit-guard.js force-release
};