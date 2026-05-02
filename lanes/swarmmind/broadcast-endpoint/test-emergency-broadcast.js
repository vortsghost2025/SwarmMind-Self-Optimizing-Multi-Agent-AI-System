#!/usr/bin/env node
/**
 * Emergency Broadcast Protocol - Preflight Check & Test
 *
 * Verifies all components are in place, then runs a full end-to-end test.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LANES = {
  archivist: { root: 'S:/Archivist-Agent' },
  kernel:    { root: 'S:/kernel-lane' },
  library:   { root: 'S:/self-organizing-library' },
  swarmmind: { root: 'S:/SwarmMind' }
};

const SCHEMAS_DIR = 'S:/SwarmMind/schemas';
const REQUIRED_SCHEMAS = [
  'broadcast-message-v1.json',
  'broadcast-acknowledgment-schema-v1.json'
];

function log(msg, type = 'INFO') {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${type}] ${msg}`);
}

function checkFile(filePath, description) {
  if (!fs.existsSync(filePath)) {
    log(`MISSING: ${description} at ${filePath}`, 'ERROR');
    return false;
  }
  log(`OK: ${description}`);
  return true;
}

function checkDirectory(dirPath, description) {
  if (!fs.existsSync(dirPath)) {
    log(`MISSING: ${description} at ${dirPath}`, 'ERROR');
    return false;
  }
  log(`OK: ${description}`);
  return true;
}

function checkJsonFile(filePath, description) {
  if (!fs.existsSync(filePath)) {
    log(`MISSING: ${description} at ${filePath}`, 'ERROR');
    return false;
  }
  try {
    JSON.parse(fs.readFileSync(filePath, 'utf8'));
    log(`OK: ${description}`);
    return true;
  } catch (e) {
    log(`INVALID JSON: ${description} - ${e.message}`, 'ERROR');
    return false;
  }
}

function preflightCheck() {
  log('=== EMERGENCY BROADCAST PREFLIGHT CHECK ===');
  let allOk = true;

  // 1. Check schemas exist and are valid JSON
  log('\n--- Schemas ---');
  for (const schema of REQUIRED_SCHEMAS) {
    const p = path.join(SCHEMAS_DIR, schema);
    if (!checkJsonFile(p, `Schema: ${schema}`)) allOk = false;
  }

  // 2. Check broadcast endpoint directories exist for all lanes
  log('\n--- Broadcast Endpoints ---');
  for (const [lane, config] of Object.entries(LANES)) {
    const endpointDir = path.join(config.root, 'lanes', lane, 'broadcast-endpoint');
    if (!checkDirectory(endpointDir, `${lane} broadcast-endpoint directory`)) allOk = false;

    const receiverScript = path.join(endpointDir, 'broadcast-receiver.js');
    if (!checkFile(receiverScript, `${lane} broadcast-receiver.js`)) allOk = false;
  }

  // 3. Check sender exists
  log('\n--- Sender ---');
  const senderScript = path.join(LANES.swarmmind.root, 'lanes', 'swarmmind', 'broadcast-endpoint', 'send-emergency-broadcast.js');
  if (!checkFile(senderScript, 'SwarmMind send-emergency-broadcast.js')) allOk = false;

  // 4. Check that create-signed-message.js exists in each lane's scripts/
  log('\n--- Signing Scripts ---');
  for (const [lane, config] of Object.entries(LANES)) {
    const signScript = path.join(config.root, 'scripts', 'create-signed-message.js');
    if (!checkFile(signScript, `${lane} create-signed-message.js`)) allOk = false;
  }

  // 5. Check lane inbox directories
  log('\n--- Inbox Directories ---');
  for (const [lane, config] of Object.entries(LANES)) {
    const inbox = path.join(config.root, 'lanes', lane, 'inbox');
    if (!checkDirectory(inbox, `${lane} inbox`)) allOk = false;
  }

  // 6. Check lane outbox directories
  log('\n--- Outbox Directories ---');
  for (const [lane, config] of Object.entries(LANES)) {
    const outbox = path.join(config.root, 'lanes', lane, 'outbox');
    if (!checkDirectory(outbox, `${lane} outbox`)) allOk = false;
  }

  // 7. Check lane identities (public keys)
  log('\n--- Lane Identities ---');
  for (const [lane, config] of Object.entries(LANES)) {
    const pubKey = path.join(config.root, '.identity', 'public.pem');
    if (!checkFile(pubKey, `${lane} public.pem`)) allOk = false;
  }

  log('\n=== PREFLIGHT CHECK ' + (allOk ? 'PASSED' : 'FAILED') + ' ===\n');
  return allOk;
}

function runReceiverTest(lane) {
  log(`Testing ${lane} broadcast receiver...`, 'TEST');
  const config = LANES[lane];
  const receiverScript = path.join(config.root, 'lanes', lane, 'broadcast-endpoint', 'broadcast-receiver.js');

  try {
    const result = execSync(`node "${receiverScript}" --test`, { stdio: 'pipe' }).toString();
    console.log(result);
    log(`${lane} receiver test: OK`, 'PASS');
    return true;
  } catch (err) {
    log(`${lane} receiver test FAILED: ${err.message}`, 'FAIL');
    return false;
  }
}

function sendTestBroadcast() {
  log('Sending test emergency broadcast from SwarmMind...', 'BROADCAST');
  const senderScript = path.join(LANES.swarmmind.root, 'lanes', 'swarmmind', 'broadcast-endpoint', 'send-emergency-broadcast.js');

  try {
    const output = execSync(
      `node "${senderScript}" --test`,
      { stdio: 'pipe', cwd: LANES.swarmmind.root }
    ).toString();

    console.log(output);
    log('Test broadcast sent successfully', 'PASS');
    return true;
  } catch (err) {
    log(`Test broadcast FAILED: ${err.message}`, 'FAIL');
    console.error(err.stdout?.toString() || '');
    console.error(err.stderr?.toString() || '');
    return false;
  }
}

function verifyDelivery() {
  log('Verifying delivery to all lanes...', 'VERIFY');
  const results = {};

  for (const [lane, config] of Object.entries(LANES)) {
    const processedDir = path.join(config.root, 'lanes', lane, 'inbox', 'processed');
    const outboxDir = path.join(config.root, 'lanes', lane, 'outbox');

    // Check for broadcast file in processed/
    const processedFiles = fs.existsSync(processedDir)
      ? fs.readdirSync(processedDir).filter(f => f.startsWith('broadcast-') && f.endsWith('.json'))
      : [];

    // Check for ack in outbox
    const outboxFiles = fs.existsSync(outboxDir)
      ? fs.readdirSync(outboxDir).filter(f => f.includes('broadcast-ack') && f.endsWith('.json'))
      : [];

    results[lane] = {
      processed_broadcast: processedFiles.length,
      ack_sent: outboxFiles.length,
      processed_files: processedFiles.slice(-3), // last 3
      ack_files: outboxFiles.slice(-3)
    };

    const status = (processedFiles.length > 0 && outboxFiles.length > 0) ? '✅' : '❌';
    log(`${status} ${lane}: processed=${processedFiles.length} ack=${outboxFiles.length}`, 'STATUS');
  }

  return results;
}

function printSummary(results) {
  console.log('\n=== EMERGENCY BROADCAST TEST RESULTS ===\n');
  console.log('Lane Status:');
  for (const [lane, data] of Object.entries(results)) {
    const ok = data.processed_broadcast > 0 && data.ack_sent > 0;
    const icon = ok ? '✅' : '❌';
    console.log(`  ${icon} ${lane}:`);
    console.log(`     Received: ${data.processed_broadcast} broadcast(s)`);
    console.log(`     ACKed: ${data.ack_sent} acknowledgment(s)`);
    if (data.processed_files.length > 0) console.log(`     Recent: ${data.processed_files.join(', ')}`);
    if (data.ack_files.length > 0) console.log(`     ACKs: ${data.ack_files.join(', ')}`);
  }
  console.log('\n==========================================\n');
}

function main() {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║    SWARMMIND EMERGENCY BROADCAST PROTOCOL - TEST      ║
║    Schema: broadcast-message-v1.json                  ║
║    Priority: P0 | Type: alert                         ║
╚═══════════════════════════════════════════════════════╝
`);

  // Preflight
  if (!preflightCheck()) {
    console.error('\n❌ PREFLIGHT FAILED - Fix missing components\n');
    process.exit(1);
  }

  // Test each lane receiver
  console.log('\n--- Lane Receiver Tests ---\n');
  let allReceiversOk = true;
  for (const lane of Object.keys(LANES)) {
    if (!runReceiverTest(lane)) allReceiversOk = false;
  }

  if (!allReceiversOk) {
    console.error('\n❌ Some receiver tests failed\n');
    process.exit(1);
  }

  // Send test broadcast
  console.log('\n--- Sending Test Broadcast ---\n');
  if (!sendTestBroadcast()) {
    console.error('\n❌ Failed to send test broadcast\n');
    process.exit(1);
  }

  // Wait briefly for delivery
  console.log('\n--- Awaiting Delivery (2s) ---\n');
  sleep(2000);

  // Verify
  const results = verifyDelivery();

  // Summary
  printSummary(results);

  const allDelivered = Object.values(results).every(r => r.processed_broadcast > 0 && r.ack_sent > 0);
  if (allDelivered) {
    console.log('✅ EMERGENCY BROADCAST PROTOCOL: FULLY OPERATIONAL\n');
    process.exit(0);
  } else {
    console.log('❌ EMERGENCY BROADCAST PROTOCOL: DELIVERY ISSUES DETECTED\n');
    process.exit(1);
  }
}

function sleep(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {}
}

if (require.main === module) {
  main();
}
