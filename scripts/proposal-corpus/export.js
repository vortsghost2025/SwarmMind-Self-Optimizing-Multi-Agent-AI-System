#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const outboxDir = path.join(repoRoot, 'lanes', 'swarmmind', 'outbox');
const proposalsFile = path.join(repoRoot, 'state', 'proposals.jsonl');

if (!fs.existsSync(outboxDir)) {
  console.error(`Outbox directory not found: ${outboxDir}`);
  process.exit(1);
}
const outboxFiles = fs.readdirSync(outboxDir).filter(f => f.endsWith('.json'));

let writeStream;
try {
  writeStream = fs.createWriteStream(proposalsFile, { flags: 'a', encoding: 'utf8' });
} catch (e) {
  console.error(`Failed to open proposals file: ${e.message}`);
  process.exit(1);
}

let count = 0;
for (const file of outboxFiles) {
  const filePath = path.join(outboxDir, file);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const msg = JSON.parse(raw);
    // Only include SwarmMind proposals
    if (msg.from !== 'swarmmind') continue;
    if (!msg.task_id) continue;
    const entry = {
      ...msg,
      _corpus_ingested_at: new Date().toISOString(),
      _corpus_status: 'pending'
    };
    writeStream.write(JSON.stringify(entry) + '\n');
    count++;
  } catch (e) {
    console.error(`Error processing ${file}: ${e.message}`);
  }
}
writeStream.end();
console.log(`Proposal corpus export: ingested ${count} SwarmMind proposals from outbox`);
