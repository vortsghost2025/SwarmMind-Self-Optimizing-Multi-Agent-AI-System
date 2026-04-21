/**
 * File Permission Enforcement Module
 * 
 * Wraps fs and fs.promises methods to enforce lane-based access control.
 * Integrates with laneContextGate to trigger HOLD on violations.
 * 
 * Permission model:
 * - Each lane (archivist, swarmmind, library) has a whitelist of path patterns
 * - Operations: read, write, append, mkdir, delete (unlink/rmdir)
 * - Patterns use minimatch-style globs (simplified to prefix matching for v1)
 */

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');

// Load lane context (set by governed-start) - use getter to read latest value
function getCurrentLane() {
  return process.env.LANE_NAME || 'unknown';
}

// Whitelist configuration: lane -> { operations: [ { pattern, allowedOps } ] }
// For v1 we use simple prefix-based path matching
const PERMISSION_WHITELIST = {
  archivist: {
    // Archivist can read/write anywhere (governance files)
    read: ['*'],
    write: ['*'],
    append: ['*'],
    mkdir: ['*'],
    delete: ['*']
  },
  swarmmind: {
    // SwarmMind can write only to its own workspace and queue
    read: ['*'],  // Can read any file for verification
        write: [
                'S:/SwarmMind Self-Optimizing Multi-Agent AI System/**',
                'S:/self-organizing-library/**',
                'queue/**'
            ],
            append: [
                'S:/SwarmMind Self-Optimizing Multi-Agent AI System/**',
                'S:/self-organizing-library/**',
                'queue/**'
            ],
            mkdir: [
                'S:/SwarmMind Self-Optimizing Multi-Agent AI System/**',
                'S:/self-organizing-library/**',
                'queue/**'
            ],
            delete: [
                'S:/SwarmMind Self-Optimizing Multi-Agent AI System/**',
                'queue/**'
    ]
  },
  library: {
    // Library primarily reads, writes only to verification output
    read: ['*'],
    write: [
      'S:/self-organizing-library/**',
      'queue/**'
    ],
    append: [
      'S:/self-organizing-library/**',
      'queue/**'
    ],
    mkdir: [
      'S:/self-organizing-library/**',
      'queue/**'
    ],
    delete: [
      'S:/self-organizing-library/**',
      'queue/**'
    ]
  }
};

/**
 * Normalize a file path for comparison
 */
function normalizePath(filePath) {
  // Resolve to absolute and normalize separators
  const abs = path.resolve(filePath);
  return abs.replace(/\\/g, '/');  // Windows: normalize to forward slashes
}

/**
 * Check if a given path matches any of the lane's allowed patterns for an operation
 */
function isAllowed(lane, operation, filePath) {
  const laneRules = PERMISSION_WHITELIST[lane];
  if (!laneRules) return false;
  
  const patterns = laneRules[operation];
  if (!patterns || patterns.length === 0) return false;
  
  const normPath = normalizePath(filePath);
  
  for (const pattern of patterns) {
    // Exact wildcard matches all
    if (pattern === '*') {
      return true;
    }
    // Directory recursive wildcard: '**'
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3);  // remove '/**'
      if (normPath.startsWith(normalizePath(prefix))) return true;
    }
    // Trailing wildcard: 'prefix*'
    else if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (normPath.startsWith(normalizePath(prefix))) return true;
    }
    // Exact match
    else {
      if (normPath === normalizePath(pattern)) return true;
    }
  }
  return false;
}

/**
 * Permission violation handler – integrates with laneContextGate
 */
function permissionViolation(operation, filePath) {
  const msg = `PERMISSION DENIED: Lane ${getCurrentLane()} attempted ${operation} on ${filePath}`;
  // Emit to console and also trigger HOLD via lane gate if available
  console.error(msg);
  
  // If laneContextGate is loaded, it will catch the thrown error and enter HOLD
  const err = new Error(msg);
  err.code = 'E_PERMISSION_DENIED';
  throw err;
}

/**
 * Wrap a function to perform permission check before execution
 */
function wrapWithPermission(fn, operation, needsPathArg = true) {
  return function(...args) {
    let filePath;
    if (needsPathArg) {
      filePath = args[0];
      if (!filePath) {
        return fn.apply(this, args);
      }
      if (!isAllowed(getCurrentLane(), operation, filePath)) {
        permissionViolation(operation, filePath);
      }
    }
    return fn.apply(this, args);
  };
}

/**
 * Patch fs sync methods
 */
function patchFsSync() {
  // Wrap synchronous methods that take a path
  if (fs.writeFileSync) fs.writeFileSync = wrapWithPermission(fs.writeFileSync, 'write');
  if (fs.appendFileSync) fs.appendFileSync = wrapWithPermission(fs.appendFileSync, 'append');
  if (fs.mkdirSync) fs.mkdirSync = wrapWithPermission(fs.mkdirSync, 'mkdir');
  if (fs.unlinkSync) fs.unlinkSync = wrapWithPermission(fs.unlinkSync, 'delete');
  if (fs.rmdirSync) fs.rmdirSync = wrapWithPermission(fs.rmdirSync, 'delete');
  if (fs.readFileSync) fs.readFileSync = wrapWithPermission(fs.readFileSync, 'read');
  
  // Also patch stat, access, etc. (read operations are allowed broadly but still logged)
}

/**
 * Patch fs.promises async methods
 */
async function patchFsPromises() {
  if (fsPromises.writeFile) fsPromises.writeFile = wrapWithPermission(fsPromises.writeFile, 'write');
  if (fsPromises.appendFile) fsPromises.appendFile = wrapWithPermission(fsPromises.appendFile, 'append');
  if (fsPromises.mkdir) fsPromises.mkdir = wrapWithPermission(fsPromises.mkdir, 'mkdir');
  if (fsPromises.unlink) fsPromises.unlink = wrapWithPermission(fsPromises.unlink, 'delete');
  if (fsPromises.rmdir) fsPromises.rmdir = wrapWithPermission(fsPromises.rmdir, 'delete');
  if (fsPromises.readFile) fsPromises.readFile = wrapWithPermission(fsPromises.readFile, 'read');
}

/**
 * Auto‑install: patch immediately when module is required
 */
patchFsSync();
patchFsPromises();

module.exports = {
  FilePermissionEnforcer: {
    isAllowed,
    permissionViolation
  },
  PERMISSION_WHITELIST
};
