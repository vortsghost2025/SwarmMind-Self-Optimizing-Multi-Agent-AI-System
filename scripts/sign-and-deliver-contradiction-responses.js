const crypto = require('crypto');
const fs = require('fs');

function signAndDeliver(inputPath, toLane = 'archivist') {
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  const { createSignedMessage } = require('S:/SwarmMind/scripts/create-signed-message.js');
  const signed = createSignedMessage(data, 'swarmmind');

  const ts = new Date().toISOString().replace(/[:]/g, '-').slice(0, 19);
  const outName = `swarmmind-contradiction-${data.task_id}-${ts}.json`;
  const outPath = `S:/Archivist-Agent/lanes/archivist/inbox/processed/${outName}`;

  fs.writeFileSync(outPath, JSON.stringify(signed, null, 2));
  console.log(`Delivered: ${outPath}`);
  return outPath;
}

// Deliver both batch responses
const p1 = signAndDeliver('S:/Archivist-Agent/lanes/archivist/inbox/quarantine/contradiction-batch-1-responses-20260430.json');
const p2 = signAndDeliver('S:/Archivist-Agent/lanes/archivist/inbox/quarantine/contradiction-batch-3-responses-20260430.json');

console.log('Both batch responses delivered to Archivist processed inbox');
