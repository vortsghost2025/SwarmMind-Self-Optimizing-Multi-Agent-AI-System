/**
 * LOCAL LANE DISCOVERY UTILITY
 * ORIGIN: S:/Archivist-Agent/.global/lane-discovery.js
 * LOCALIZED: SwarmMind (2026-05-03)
 * PURPOSE: Platform-aware lane discovery — auto-detects Windows S:/ vs Ubuntu paths
 * FALLBACK: Original Windows-only version backed up as lane-discovery-win-backup.js
 */
const os = require('os');
const path = require('path');
function _resolveRoots() {
  if (process.platform === 'win32' || process.env.LANE_PLATFORM === 'windows') {
    return { archivist: 'S:/Archivist-Agent', library: 'S:/self-organizing-library', kernel: 'S:/kernel-lane', swarmmind: 'S:/SwarmMind' };
  }
  const reposDir = process.env.LANE_REPOS_DIR || path.join(os.homedir(), 'agent', 'repos');
  return { archivist: path.join(reposDir, 'Archivist-Agent'), library: path.join(reposDir, 'self-organizing-library'), kernel: path.join(reposDir, 'kernel-lane'), swarmmind: path.join(reposDir, 'SwarmMind') };
}
const ROOTS = _resolveRoots();
const LANES = {};
for (const [id, root] of Object.entries(ROOTS)) {
  LANES[id] = {
    name: id.charAt(0).toUpperCase() + id.slice(1),
    root: root,
    get inbox() { return path.join(this.root, 'lanes', id, 'inbox'); },
    get outbox() { return path.join(this.root, 'lanes', id, 'outbox'); },
    get state() { return path.join(this.root, 'lanes', id, 'state'); }
  };
}
function sToLocal(sPath) {
  return sPath.replace(/^S:\//, ROOTS.archivist.replace(/\/Archivist-Agent$/, '') + '/');
}
function getLane(name) { return LANES[name.toLowerCase()]; }
function getAllLanes() { return Object.values(LANES); }
function getLaneNames() { return Object.keys(LANES); }
function getRoots() { return ROOTS; }
module.exports = { LANES, ROOTS, sToLocal, getLane, getAllLanes, getLaneNames, getRoots };
