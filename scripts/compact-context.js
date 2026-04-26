// scripts/compact-context.js
/**
 * Compact the current conversation context for handoff.
 * Intended to run under Node.js >=14.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ---- Configuration ----
const CONFIG = {
  // Paths – adjust if your layout differs
  dialoguePath: path.resolve('S:/SwarmMind/dialogue_history.json'),
  snapshotPath: path.resolve('S:/lanes/current/broadcast/system_state.json'),
  outputPath: path.resolve('S:/.global/compact_payload_latest.json'),
  // Summarisation model endpoint – replace with your fast model CLI
  summarizeCmd: 'kilo summarize --model fast --max-tokens 2000',
  // Maximum output size (tokens) for the compact payload
  maxPayloadTokens: 90000,
};

function loadJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
}

function summariseConversation(messages) {
  // Serialize messages to a temporary JSON file for the CLI
  const os = require('os');
  const tempPath = path.join(os.tmpdir(), 'dialogue.tmp.json');
  saveJson(tempPath, messages);

  // Run the summarisation command – it reads the temp file and writes summary to stdout
  const cmd = `${CONFIG.summarizeCmd} --input ${tempPath}`;
  const summary = execSync(cmd, { encoding: 'utf8' }).trim();
  return summary;
}

function compact() {
  const dialogue = loadJson(CONFIG.dialoguePath) || [];
  const snapshot = loadJson(CONFIG.snapshotPath) || {};

  // Step 1: Filter out transient system messages (marked with "transient": true)
  const filtered = dialogue.filter(m => !(m.transient === true));

  // Step 2: Summarise remaining conversation
  const summary = summariseConversation(filtered);

  // Step 3: Assemble compact payload
  const payload = {
    identity: {
      assistantName: 'Kilo',
      version: 'v2026.04',
      laneId: process.env.LANE_ID || 'unknown',
    },
    timestamp: new Date().toISOString(),
    snapshot,
    summary,
  };

  // Step 4: Write payload – ensure we stay under token budget (estimate 1 token ≈ 4 characters)
  const payloadStr = JSON.stringify(payload);
  const approxTokens = Math.ceil(payloadStr.length / 4);
  if (approxTokens > CONFIG.maxPayloadTokens) {
    console.warn('Compact payload exceeds token budget; truncating summary.');
    // Simple truncation – keep first N characters that fit
    const allowedChars = CONFIG.maxPayloadTokens * 4;
    payload.summary = payload.summary.slice(0, allowedChars);
  }

  saveJson(CONFIG.outputPath, payload);
  console.log('✅ Compact payload written to', CONFIG.outputPath);
}

compact();
