const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const lanes = [
  {
    name: 'kernel',
    root: getRoots()['kernel'],
    scriptsDir: sToLocal('S:/kernel-lane/scripts'),
    batchIds: [1, 2, 3],
    responseDir: sToLocal('S:/kernel-lane/lanes/kernel/inbox/quarantine')
  },
  {
    name: 'library',
    root: getRoots()['library'],
    scriptsDir: sToLocal('S:/self-organizing-library/scripts'),
    batchIds: [1, 2],
    responseDir: sToLocal('S:/self-organizing-library/lanes/library/inbox/quarantine')
  },
  {
    name: 'archivist',
    root: getRoots()['archivist'],
    scriptsDir: sToLocal('S:/Archivist-Agent/scripts'),
    batchIds: [1, 2, 3],
    responseDir: sToLocal('S:/Archivist-Agent/lanes/archivist/inbox/quarantine')
  }
];

const outDir = sToLocal('S:/Archivist-Agent/lanes/archivist/inbox/processed');
fs.mkdirSync(outDir, { recursive: true });

lanes.forEach(lane => {
  const { createSignedMessage } = require(lane.scriptsDir + '/create-signed-message.js');
const { getRoots, sToLocal, LANES: _DL } = require('./util/lane-discovery');

  lane.batchIds.forEach(batchId => {
    const src = path.join(lane.responseDir, `contradiction-batch-${batchId}-responses-20260430.json`);
    if (!fs.existsSync(src)) {
      console.log(`[WARN] Missing: ${src}`);
      return;
    }
    const data = JSON.parse(fs.readFileSync(src, 'utf8'));
    const signed = createSignedMessage(data, lane.name);
    const ts = new Date().toISOString().replace(/[:]/g, '-').slice(0, 19);
    const outName = `${lane.name}-contradiction-batch-${batchId}-responses-${ts}.json`;
    const outPath = path.join(outDir, outName);
    fs.writeFileSync(outPath, JSON.stringify(signed, null, 2));
    console.log(`Delivered: ${outPath}`);
  });
});

console.log('All contradiction batch responses delivered to Archivist processed inbox.');
