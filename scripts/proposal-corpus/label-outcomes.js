#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const proposalsFile = path.join(repoRoot, 'state', 'proposals.jsonl');
if (!fs.existsSync(proposalsFile)) {
  console.log('No proposals file yet; nothing to label.');
  process.exit(0);
}
const outboxDir = path.join(repoRoot, 'lanes', 'swarmmind', 'outbox');
const deliveredDir = path.join(outboxDir, 'delivered');

// Helper to read all JSON files from a directory
function readJsonFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        const obj = JSON.parse(content);
        results.push(obj);
      } catch (e) {
        console.warn(`Failed to parse ${file}: ${e.message}`);
      }
    }
  }
  return results;
}

// Collect all outbox messages (both outbox and delivered)
const outboxMessages = readJsonFiles(outboxDir).concat(readJsonFiles(deliveredDir));
console.log(`Found ${outboxMessages.length} outbox/delivered messages for outcome labeling.`);

// Build a map from task_id to outcome based on message content
const outcomeMap = new Map();
for (const msg of outboxMessages) {
  const taskId = msg.task_id;
  if (!taskId) continue;
  let outcome = 'UNKNOWN';
  // Check if message is a NACK
  if (msg.type === 'notification' && msg.nack_reason) {
    outcome = 'NACKED';
  }
  // Check if message indicates ratification (we could look for a specific type or custom field)
  // For now, assume any message from SwarmMind to Archivist with type 'response' and task_kind 'ratification' is ratification
  if (msg.from === 'swarmmind' && msg.to === 'archivist' && msg.type === 'response' && msg.task_kind === 'ratification') {
    outcome = 'RATIFIED';
  }
  // If not NACKED or RATIFIED, treat as AMENDED (or maybe PENDING)
  if (outcome === 'UNKNOWN') {
    outcome = 'AMENDED'; // default for proposals that are not yet decided
  }
  outcomeMap.set(taskId, outcome);
}

// Read proposals.jsonl, add outcome field, write back
const lines = fs.readFileSync(proposalsFile, 'utf8').trim().split('\n').filter(l => l.trim().length > 0);
const updated = [];
for (const line of lines) {
  try {
    const obj = JSON.parse(line);
    const taskId = obj.task_id;
    if (taskId && outcomeMap.has(taskId)) {
      obj.outcome = outcomeMap.get(taskId);
    } else {
      obj.outcome = 'PENDING'; // no info yet
    }
    updated.push(JSON.stringify(obj));
  } catch (e) {
    console.warn(`Skipping invalid line: ${e.message}`);
    updated.push(line); // keep original
  }
}
fs.writeFileSync(proposalsFile, updated.join('\n') + '\n', 'utf8');
console.log(`Labeled ${updated.length} proposals.`);
