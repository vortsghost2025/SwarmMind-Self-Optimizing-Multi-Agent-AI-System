/**
 * LOCAL LANE DISCOVERY UTILITY
 * ORIGIN: S:/Archivist-Agent/.global/lane-discovery.js
 * LOCALIZED: SwarmMind (2026-05-02)
 * PURPOSE: Local implementation to avoid cross-lane require()
 */

const LANES = {
  archivist: {
    name: 'Archivist',
    root: 'S:/Archivist-Agent',
    inbox: 'S:/Archivist-Agent/lanes/archivist/inbox',
    outbox: 'S:/Archivist-Agent/lanes/archivist/outbox',
    state: 'S:/Archivist-Agent/lanes/archivist/state'
  },
  library: {
    name: 'Library',
    root: 'S:/self-organizing-library',
    inbox: 'S:/self-organizing-library/lanes/library/inbox',
    outbox: 'S:/self-organizing-library/lanes/library/outbox',
    state: 'S:/self-organizing-library/lanes/library/state'
  },
  kernel: {
    name: 'Kernel',
    root: 'S:/kernel-lane',
    inbox: 'S:/kernel-lane/lanes/kernel/inbox',
    outbox: 'S:/kernel-lane/lanes/kernel/outbox',
    state: 'S:/kernel-lane/lanes/kernel/state'
  },
  swarmmind: {
    name: 'SwarmMind',
    root: 'S:/SwarmMind',
    inbox: 'S:/SwarmMind/lanes/swarmmind/inbox',
    outbox: 'S:/SwarmMind/lanes/swarmmind/outbox',
    state: 'S:/SwarmMind/lanes/swarmmind/state'
  }
};

function getLane(name) {
  return LANES[name.toLowerCase()];
}

function getAllLanes() {
  return Object.values(LANES);
}

function getLaneNames() {
  return Object.keys(LANES);
}

module.exports = {
  LANES,
  getLane,
  getAllLanes,
  getLaneNames
};

/**
 * Note: Original Archivist version includes dynamic discovery.
 * This is a simplified static version for SwarmMind sovereignty.
 */