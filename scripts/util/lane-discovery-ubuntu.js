/**
 * Ubuntu-native lane discovery.
 * Replaces hardcoded S:/ paths with /home/we4free/agent/repos/ equivalents.
 * ORIGIN: S:/Archivist-Agent/.global/lane-discovery.js
 * LOCALIZED: SwarmMind (2026-05-03) — Ubuntu adaptation
 */

const os = require('os');
const path = require('path');

const REPOS_DIR = process.env.LANE_REPOS_DIR || path.join(os.homedir(), 'agent', 'repos');

const LANES = {
  archivist: {
    name: 'Archivist',
    root: path.join(REPOS_DIR, 'Archivist-Agent'),
    get inbox() { return path.join(this.root, 'lanes/archivist/inbox'); },
    get outbox() { return path.join(this.root, 'lanes/archivist/outbox'); },
    get state() { return path.join(this.root, 'lanes/archivist/state'); }
  },
  library: {
    name: 'Library',
    root: path.join(REPOS_DIR, 'self-organizing-library'),
    get inbox() { return path.join(this.root, 'lanes/library/inbox'); },
    get outbox() { return path.join(this.root, 'lanes/library/outbox'); },
    get state() { return path.join(this.root, 'lanes/library/state'); }
  },
  kernel: {
    name: 'Kernel',
    root: path.join(REPOS_DIR, 'kernel-lane'),
    get inbox() { return path.join(this.root, 'lanes/kernel/inbox'); },
    get outbox() { return path.join(this.root, 'lanes/kernel/outbox'); },
    get state() { return path.join(this.root, 'lanes/kernel/state'); }
  },
  swarmmind: {
    name: 'SwarmMind',
    root: path.join(REPOS_DIR, 'SwarmMind'),
    get inbox() { return path.join(this.root, 'lanes/swarmmind/inbox'); },
    get outbox() { return path.join(this.root, 'lanes/swarmmind/outbox'); },
    get state() { return path.join(this.root, 'lanes/swarmmind/state'); }
  }
};

function sToLocal(sPath) {
  return sPath.replace(/^S:\//, REPOS_DIR + '/');
}

function getLane(name) {
  return LANES[name.toLowerCase()];
}

function getAllLanes() {
  return Object.values(LANES);
}

const ROOTS = {};
for (const [id, info] of Object.entries(LANES)) {
  ROOTS[id] = info.root;
}

function getLaneNames() {
  return Object.keys(LANES);
}

function getRoots() {
  return ROOTS;
}

module.exports = {
  REPOS_DIR,
  ROOTS,
  LANES,
  sToLocal,
  getLane,
  getAllLanes,
  getLaneNames,
  getRoots
};
