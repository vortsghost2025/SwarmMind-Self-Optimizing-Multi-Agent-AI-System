#!/usr/bin/env node
/**
 * SwarmMind Heartbeat
 *
 * SINGLE SOURCE OF TRUTH: contradictions.json → heartbeat.js → system_state.json
 * No other script may write system_state.json.
 */
const fs = require('fs');
const path = require('path');

const HEARTBEAT_PATH = path.join(__dirname, '..', 'lanes', 'swarmmind', 'inbox', 'heartbeat-swarmmind.json');
const CONTRA_PATH = path.join(__dirname, '..', 'lanes', 'broadcast', 'contradictions.json');

function loadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

function auditProcessedOk() {
  const procDir = path.join(__dirname, '..', 'lanes', 'swarmmind', 'inbox', 'processed');
  try {
    const files = fs.readdirSync(procDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const full = path.join(procDir, f);
      const msg = loadJSON(full);
      if (msg && msg.requires_action === true) {
        if (!msg.completion_artifact_path && !msg.resolved_by_task_id && !msg.terminal_decision) {
          return false;
        }
      }
    }
  } catch (_) {}
  return true;
}

function writeSystemState(systemState, activeContradictions, processedOk) {
  const broadcastDir = path.join(__dirname, '..', 'lanes', 'broadcast');
  const statePath = path.join(broadcastDir, 'system_state.json');
  const payload = {
    system_status: systemState,
    timestamp: new Date().toISOString(),
    active_contradictions: activeContradictions,
    total_contradictions: activeContradictions.length,
    compaction_enabled: activeContradictions.length === 0,
    compaction_suspend_reason: activeContradictions.length > 0 ? 'Active contradictions present' : null,
    processed_ok: processedOk,
    derived_from: 'contradictions.json',
    written_by: 'heartbeat.js'
  };
  try {
    if (!fs.existsSync(broadcastDir)) {
      fs.mkdirSync(broadcastDir, { recursive: true });
    }
    fs.writeFileSync(statePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  } catch (err) {
    console.error('Failed to write system_state.json:', err.message);
  }
}

function update() {
  const contra = loadJSON(CONTRA_PATH);
  const activeContras = (contra && Array.isArray(contra)) ? contra.filter(c => c.status === 'active' || c.status === 'resolving').map(c => c.id) : [];
  const hasActive = activeContras.length > 0;
  const processedOk = auditProcessedOk();

  const systemState = hasActive ? 'degraded' : 'consistent';
  const compactionEnabled = !hasActive;
  const compactionSuspendReason = hasActive ? 'Active contradictions present' : null;

  // Write system_state.json (single source of truth: contradictions → heartbeat → system_state)
  writeSystemState(systemState, activeContras, processedOk);

  const data = {
    schema_version: "1.1",
    type: "heartbeat",
    lane: "swarmmind",
    timestamp: new Date().toISOString(),
    status: "alive",
    system_state: systemState,
    active_contradictions: activeContras,
    processed_ok: processedOk,
    compaction_enabled: compactionEnabled,
    compaction_suspend_reason: compactionSuspendReason
  };

  fs.writeFileSync(HEARTBEAT_PATH, JSON.stringify(data, null, 2));
  console.log(`[heartbeat] updated at ${data.timestamp} - system_state=${systemState} active=${activeContras.length}`);
}

update();
if (process.argv.includes('--watch')) {
  setInterval(update, 60 * 1000);
}
