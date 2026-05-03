#!/usr/bin/env node
/**
 * UBUNTU PATH ADAPTER
 * Wraps the original lane-discovery.js and overrides S:/ paths with Ubuntu-native paths.
 * Scripts should require('./util/ubuntu-adapter') instead of using hardcoded S:/ dicts.
 * This file is Ubuntu-specific and won't be overwritten by cross-lane sync.
 */

const os = require('os');
const path = require('path');

const REPOS_DIR = process.env.LANE_REPOS_DIR || path.join(os.homedir(), 'agent', 'repos');

function _isWindows() {
  return process.platform === 'win32' || process.env.LANE_PLATFORM === 'windows';
}

function resolveRoot(laneId) {
  if (_isWindows()) {
    const winMap = {
      archivist: 'S:/Archivist-Agent',
      library: 'S:/self-organizing-library',
      kernel: 'S:/kernel-lane',
      swarmmind: 'S:/SwarmMind',
    };
    return winMap[laneId];
  }
  const linuxMap = {
    archivist: path.join(REPOS_DIR, 'Archivist-Agent'),
    library: path.join(REPOS_DIR, 'self-organizing-library'),
    kernel: path.join(REPOS_DIR, 'kernel-lane'),
    swarmmind: path.join(REPOS_DIR, 'SwarmMind'),
  };
  return linuxMap[laneId];
}

const ROOTS = {};
const LANE_IDS = ['archivist', 'library', 'kernel', 'swarmmind'];
for (const id of LANE_IDS) {
  ROOTS[id] = resolveRoot(id);
}

const LANES = {};
for (const id of LANE_IDS) {
  const root = ROOTS[id];
  LANES[id] = {
    name: id.charAt(0).toUpperCase() + id.slice(1),
    root,
    get inbox() { return path.join(this.root, 'lanes', id, 'inbox'); },
    get outbox() { return path.join(this.root, 'lanes', id, 'outbox'); },
    get state() { return path.join(this.root, 'lanes', id, 'state'); },
  };
}

function sToLocal(sPath) {
  return sPath.replace(/^S:\//, REPOS_DIR + '/');
}

function getLane(name) {
  return LANES[name.toLowerCase()];
}

function getAllLanes() {
  return Object.values(LANES);
}

function getLaneNames() {
  return Object.keys(LANES);
}

function getRoots() {
  return ROOTS;
}

function resolveInbox(laneId) {
  return path.join(resolveRoot(laneId), 'lanes', laneId, 'inbox');
}

function resolveIdentityDir(laneId) {
  return path.join(resolveRoot(laneId), '.identity');
}

module.exports = {
  REPOS_DIR,
  ROOTS,
  LANES,
  sToLocal,
  getLane,
  getAllLanes,
  getLaneNames,
  getRoots,
  resolveRoot,
  resolveInbox,
  resolveIdentityDir,
};
