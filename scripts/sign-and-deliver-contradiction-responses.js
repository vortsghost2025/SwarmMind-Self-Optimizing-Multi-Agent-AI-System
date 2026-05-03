const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { sToLocal } = require('./util/lane-discovery');

function signAndDeliver(inputPath, toLane = 'archivist') {
const data = JSON.parse(fs.readFileSync(sToLocal(inputPath), 'utf8'));

const { createSignedMessage } = require(path.join(__dirname, 'create-signed-message.js'));
const signed = createSignedMessage(data, 'swarmmind');

const ts = new Date().toISOString().replace(/[:]/g, '-').slice(0, 19);
const outName = `swarmmind-contradiction-${data.task_id}-${ts}.json`;
const outPath = sToLocal(`S:/Archivist-Agent/lanes/archivist/inbox/processed/${outName}`);

fs.writeFileSync(outPath, JSON.stringify(signed, null, 2));
console.log(`Delivered: ${outPath}`);
return outPath;
}

const p1 = signAndDeliver('S:/Archivist-Agent/lanes/archivist/inbox/quarantine/contradiction-batch-1-responses-20260430.json');
const p2 = signAndDeliver('S:/Archivist-Agent/lanes/archivist/inbox/quarantine/contradiction-batch-3-responses-20260430.json');

console.log('Both batch responses delivered to Archivist processed inbox');
