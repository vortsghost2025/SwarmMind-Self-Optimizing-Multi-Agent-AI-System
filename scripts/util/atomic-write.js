/**
 * Atomic Write Utility (SwarmMind Local Copy)
 * ORIGIN: kernel-lane/scripts/atomic-write-util.js
 * PURPOSE: Sovereign implementation for SwarmMind autonomy
 * DATE: 2026-05-02
 * 
 * Note: This is a local copy to maintain lane sovereignty.
 * Updates to the canonical version should be propagated to all lanes.
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

/**
 * Atomically write JSON with lease protection
 * Prevents race conditions in multi-process environments
 */
async function atomicWriteJson(filePath, data, leaseId = null) {
  const dir = path.dirname(filePath);
  const tempFile = path.join(dir, `.${path.basename(filePath)}.tmp.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`);
  
  try {
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });
    
    // Write to temp file first
    await fs.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf8');
    
    // Verify write succeeded
    const verify = JSON.parse(await fs.readFile(tempFile, 'utf8'));
    if (!verify) {
      throw new Error('Write verification failed');
    }
    
    // Atomic rename (on same filesystem)
    await fs.rename(tempFile, filePath);
    
    return { success: true, path: filePath, leaseId };
  } catch (error) {
    // Cleanup temp file on error
    try {
      await fs.unlink(tempFile);
    } catch (e) {
      // Ignore cleanup errors
    }
    
    return { 
      success: false, 
      path: filePath, 
      error: error.message,
      leaseId 
    };
  }
}

/**
 * Synchronous atomic write (for initialization scripts)
 */
function atomicWriteJsonSync(filePath, data, leaseId = null) {
  const dir = path.dirname(filePath);
  const tempFile = path.join(dir, `.${path.basename(filePath)}.tmp.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`);
  
  try {
    fsSync.mkdirSync(dir, { recursive: true });
    fsSync.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    
    // Verify
    const verify = JSON.parse(fsSync.readFileSync(tempFile, 'utf8'));
    if (!verify) {
      throw new Error('Write verification failed');
    }
    
    fsSync.renameSync(tempFile, filePath);
    
    return { success: true, path: filePath, leaseId };
  } catch (error) {
    try {
      fsSync.unlinkSync(tempFile);
    } catch (e) {}
    
    return { 
      success: false, 
      path: filePath, 
      error: error.message,
      leaseId 
    };
  }
}

/**
 * Atomic write with lease protection
 * Returns error if lease is held by another process
 */
async function atomicWriteWithLease(filePath, data, leaseTimeoutMs = 900000) {
  const leaseFile = `${filePath}.lease`;
  
  try {
    // Check for existing lease
    let existingLease = null;
    try {
      const leaseData = await fs.readFile(leaseFile, 'utf8');
      existingLease = JSON.parse(leaseData);
    } catch (e) {
      // No existing lease, proceed
    }
    
    // If lease exists and is recent, reject
    if (existingLease && existingLease.expiresAt > Date.now()) {
      return {
        success: false,
        error: 'Lease held by another process',
        lease: existingLease
      };
    }
    
    // Acquire new lease
    const newLease = {
      processId: process.pid,
      timestamp: Date.now(),
      expiresAt: Date.now() + leaseTimeoutMs,
      filePath
    };
    
    await fs.writeFile(leaseFile, JSON.stringify(newLease, null, 2), 'utf8');
    
    // Perform atomic write
    const result = await atomicWriteJson(filePath, data);
    
    // Release lease
    try {
      await fs.unlink(leaseFile);
    } catch (e) {}
    
    return result;
  } catch (error) {
    // Release lease on error
    try {
      await fs.unlink(leaseFile);
    } catch (e) {}
    
    return { 
      success: false, 
      error: error.message 
    };
  }
}

module.exports = {
  atomicWriteJson,
  atomicWriteJsonSync,
  atomicWriteWithLease
};

/**
 * ORIGIN NOTE: Adapted from kernel-lane/scripts/atomic-write-util.js
 * LOCAL COPY FOR SWARMMIND LANE SOVEREIGNTY
 * Last sync: 2026-05-02
 */