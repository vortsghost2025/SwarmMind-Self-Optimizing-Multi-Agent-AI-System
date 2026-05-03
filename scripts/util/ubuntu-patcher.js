#!/usr/bin/env node
/**
 * UBUNTU RUNTIME PATCHER
 * Patches hardcoded S:/ path constants in core scripts at require() time.
 * Usage: require('./util/ubuntu-patcher') at the TOP of a script, before
 * any other script-level constants are evaluated.
 *
 * Strategy: intercept require() to rewrite S:/ path dicts in the
 * lane-discovery, agent-presence, relay-daemon, etc. modules.
 *
 * This file is Ubuntu-specific and won't be overwritten by cross-lane sync.
 */

const path = require('path');
const os = require('os');

const REPOS_DIR = process.env.LANE_REPOS_DIR || path.join(os.homedir(), 'agent', 'repos');

const LANE_ROOT_MAP = {
  archivist: path.join(REPOS_DIR, 'Archivist-Agent'),
  library: path.join(REPOS_DIR, 'self-organizing-library'),
  kernel: path.join(REPOS_DIR, 'kernel-lane'),
  swarmmind: path.join(REPOS_DIR, 'SwarmMind'),
};

function sToLocal(sPath) {
  return sPath.replace(/^S:\//, REPOS_DIR + '/');
}

function patchRoots(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string' && val.startsWith('S:/')) {
      obj[key] = sToLocal(val);
    }
  }
  return obj;
}

function patchLaneRegistry(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const [lane, entry] of Object.entries(obj)) {
    if (entry && typeof entry === 'object') {
      if (typeof entry.root === 'string' && entry.root.startsWith('S:/')) {
        entry.root = sToLocal(entry.root);
      }
      if (typeof entry.inbox_target === 'string' && entry.inbox_target.startsWith('S:/')) {
        entry.inbox_target = sToLocal(entry.inbox_target);
      }
    }
  }
  return obj;
}

function patchCanonicalInbox(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string' && val.startsWith('S:/')) {
      obj[key] = sToLocal(val);
      if (!obj[key].endsWith('/')) {
        // Preserve trailing slash convention
      }
    }
  }
  return obj;
}

function patchIdentityDirs(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string' && val.startsWith('S:/')) {
      obj[key] = sToLocal(val);
    }
  }
  return obj;
}

function patchPassfileCandidates(arr) {
  if (!Array.isArray(arr)) return arr;
  for (let i = 0; i < arr.length; i++) {
    if (typeof arr[i] === 'string' && arr[i].startsWith('S:/')) {
      arr[i] = sToLocal(arr[i]);
    }
  }
  return arr;
}

function patchCanonicalPaths(obj) {
  return patchCanonicalInbox(obj);
}

let _patched = false;

function apply() {
  if (_patched) return;
  _patched = true;

  // Patch any already-loaded modules
  for (const [modPath, mod] of Object.entries(require.cache)) {
    if (!modPath) continue;
    const exports = mod.exports;
    if (!exports || typeof exports !== 'object') continue;

    if (exports.LANE_ROOTS) patchRoots(exports.LANE_ROOTS);
    if (exports.LANE_REGISTRY) patchLaneRegistry(exports.LANE_REGISTRY);
    if (exports.CANONICAL_INBOX) patchCanonicalInbox(exports.CANONICAL_INBOX);
    if (exports.LANE_IDENTITY_DIRS) patchIdentityDirs(exports.LANE_IDENTITY_DIRS);
    if (exports.PASSFILE_CANDIDATES) patchPassfileCandidates(exports.PASSFILE_CANDIDATES);
    if (exports.DEFAULT_CONFIG && exports.DEFAULT_CONFIG.canonicalPaths) {
      patchCanonicalPaths(exports.DEFAULT_CONFIG.canonicalPaths);
    }
  }
}

module.exports = {
  REPOS_DIR,
  LANE_ROOT_MAP,
  sToLocal,
  patchRoots,
  patchLaneRegistry,
  patchCanonicalInbox,
  patchIdentityDirs,
  patchPassfileCandidates,
  patchCanonicalPaths,
  apply,
};
