#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const HEARTBEAT_PATH = path.join(__dirname, '..', 'lanes', 'swarmmind', 'inbox', 'heartbeat-swarmmind.json');
const SYS_STATE_PATH = path.join(__dirname, '..', 'lanes', 'broadcast', 'system_state.json');
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
        // needs completion proof
        if (!msg.completion_artifact_path && !msg.resolved_by_task_id && !msg.terminal_decision) {
          return false;
        }
      }
    }
  } catch (_) {}
  return true;
}

function update() {
  const sysState = loadJSON(SYS_STATE_PATH);
  const contra = loadJSON(CONTRA_PATH);
  const activeContras = (contra && Array.isArray(contra)) ? contra.filter(c => c.status === 'active' || c.status === 'resolving').map(c => c.id) : [];
  const hasActive = activeContras.length > 0;
  const processedOk = auditProcessedOk();

  const systemState = hasActive ? 'degraded' : ((sysState && sysState.system_status) ? sysState.system_status : 'consistent');
  const compactionEnabled = !hasActive;
  const compactionSuspendReason = hasActive ? 'P0 contradictions present' : null;

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
