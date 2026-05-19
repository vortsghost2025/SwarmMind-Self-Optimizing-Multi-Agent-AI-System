#!/usr/bin/env node
'use strict';

/**
 * SWARM OFFLINE RUNNER — Deterministic standing duties for SwarmMind
 *
 * Runs the 5 standing duties (S1-S5) during offline/autonomous periods:
 *   S1 — Cross-lane drift sweep
 *   S2 — Watcher/heartbeat health audit
 *   S3 — Robustness regression scan
 *   S4 — Cross-lane stale work detection
 *   S5 — Wake-packet enrichment
 *
 * All duties are deterministic — no model reasoning required.
 * Produces markdown reports to reports/swarm/ and updates telemetry.
 *
 * CLI:
 *   node swarm-offline-runner.js [--apply] [--dry-run] [--duty <id>]
 *
 * --dry-run  (default): show what would be done, don't write files
 * --apply:             actually execute and write artifacts
 * --duty <id>:         run only the specified night-queue id
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { ensureOutputProvenance } = require('./output-provenance');
const { LaneDiscovery, sToLocal, ROOTS, LANES } = require('./util/lane-discovery');

const RUNNER_VERSION = '1.0.0';
const LANE = 'swarmmind';
const SWARM_ROOT = LANES[LANE] ? LANES[LANE].root : (ROOTS[LANE] || 'S:/SwarmMind');
const LANE_NAMES = Object.keys(ROOTS);
const REPORTS_DIR = path.join(SWARM_ROOT, 'reports', 'swarm');
const STATE_DIR = path.join(SWARM_ROOT, 'lanes', LANE, 'state');
const TELEMETRY_PATH = path.join(STATE_DIR, 'offline-telemetry.json');
const NIGHT_QUEUE_PATH = path.join(SWARM_ROOT, 'swarm-night-queue.json');
const NIGHT_QUEUE_FALLBACK = path.join(SWARM_ROOT, 'swarm-night-queue.example.json');

const GOVERNANCE_ADJACENT_SCRIPTS = [
  'lane-worker.js',
  'verification-domain-gate.js',
  'validate-responses.js',
  'completion-proof.js',
  'output-provenance.js',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso() { return new Date().toISOString(); }
function todayStamp() { return new Date().toISOString().slice(0, 10); }

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function safeReadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return null;
  }
}

function safeWriteJson(p, data) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function fileHash(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return crypto.createHash('sha256').update(fs.readFileSync(p, 'utf8')).digest('hex');
  } catch (_) {
    return null;
  }
}

function countJson(dir) {
  if (!fs.existsSync(dir)) return 0;
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.toLowerCase().startsWith('heartbeat')).length;
  } catch (_) { return 0; }
}

function fileAgeMinutes(p) {
  try {
    if (!fs.existsSync(p)) return null;
    const stat = fs.statSync(p);
    return Math.round((Date.now() - stat.mtimeMs) / 60000);
  } catch (_) { return null; }
}

function provenanceBlock(target) {
  return [
    'OUTPUT_PROVENANCE:',
    `agent: swarm-offline-runner/${RUNNER_VERSION}`,
    `lane: ${LANE}`,
    `target: ${target}`,
    `generated_at: ${nowIso()}`,
    `session_id: offline-${todayStamp()}`,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Night queue loading
// ---------------------------------------------------------------------------

function loadNightQueue() {
  let data = safeReadJson(NIGHT_QUEUE_PATH);
  if (!data || !Array.isArray(data.queue)) {
    data = safeReadJson(NIGHT_QUEUE_FALLBACK);
  }
  if (!data || !Array.isArray(data.queue)) {
    console.error('[offline-runner] ERROR: Cannot load night queue from either path');
    return [];
  }
  return data.queue;
}

function saveNightQueue(queue) {
  const data = {
    _output_provenance: {
      agent: `swarm-offline-runner/${RUNNER_VERSION}`,
      lane: LANE,
      target: 'swarm-night-queue.json',
      generated_at: nowIso(),
    },
    schema_version: '1.0',
    generated_at: nowIso(),
    queue,
  };
  safeWriteJson(NIGHT_QUEUE_PATH, data);
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

function loadTelemetry() {
  return safeReadJson(TELEMETRY_PATH) || {
    offline_checks_run: 0,
    drift_findings_created: 0,
    wake_packets_enriched: 0,
    stale_items_escalated: 0,
    executor_tasks_completed: 0,
    model_required_work_queued: 0,
    last_updated: null,
  };
}

function saveTelemetry(t) {
  t.last_updated = nowIso();
  safeWriteJson(TELEMETRY_PATH, t);
}

function incTelemetry(key, delta) {
  const t = loadTelemetry();
  t[key] = (t[key] || 0) + delta;
  saveTelemetry(t);
  return t;
}

// ---------------------------------------------------------------------------
// S1 — Cross-lane drift sweep
// ---------------------------------------------------------------------------

function runDriftSweep(apply) {
  const t0 = Date.now();
  const dateStamp = todayStamp();
  const artifactPath = path.join(REPORTS_DIR, `drift-sweep-${dateStamp}.md`);

  // Read canonical script registry
  const registryPath = path.join(SWARM_ROOT, 'scripts', 'CANONICAL_SCRIPT_REGISTRY.json');
  const registry = safeReadJson(registryPath);
  if (!registry) {
    console.log(`[offline-runner] duty=swarm-night-drift-sweep status=failure artifact=null time=${Date.now() - t0}ms — registry not found`);
    return { id: 'swarm-night-drift-sweep', success: false, artifact: null, findings: 0, escalations: 0, error: 'registry not found' };
  }

  const scriptNames = Array.isArray(registry.shared_scripts) ? registry.shared_scripts : [];
  const utilModules = Array.isArray(registry.shared_util_modules) ? registry.shared_util_modules : [];
  const allItems = [...scriptNames.map(s => ({ name: s, subdir: 'scripts' })), ...utilModules.map(s => ({ name: s, subdir: '' }))];

  const drift = [];
  const matched = [];
  const missing = [];
  const escalations = [];

  for (const item of allItems) {
    const hashes = {};
    const perLane = {};
    for (const ln of LANE_NAMES) {
      const scriptPath = path.join(ROOTS[ln], item.subdir, item.name);
      const h = fileHash(scriptPath);
      hashes[ln] = h;
      perLane[ln] = h || 'MISSING';
      if (h === null) {
        missing.push({ script: item.name, lane: ln });
      }
    }

    const uniqueHashes = [...new Set(Object.values(hashes).filter(h => h !== null))];
    if (uniqueHashes.length === 0) {
      drift.push({ script: item.name, classification: 'MISSING', detail: 'All lanes missing', per_lane: perLane });
    } else if (uniqueHashes.length === 1) {
      matched.push({ script: item.name, classification: 'OK', hash: uniqueHashes[0] });
    } else if (uniqueHashes.length === 2) {
      const isGov = GOVERNANCE_ADJACENT_SCRIPTS.some(g => item.name.includes(g));
      const cls = isGov ? 'RISK' : 'NEEDS_SYNC';
      drift.push({ script: item.name, classification: cls, detail: `${uniqueHashes.length} distinct versions`, per_lane: perLane });
      if (isGov) {
        escalations.push({ script: item.name, reason: 'Governance-adjacent script drift detected', classification: 'RISK' });
      }
    } else {
      drift.push({ script: item.name, classification: 'RISK', detail: `${uniqueHashes.length} distinct versions`, per_lane: perLane });
      escalations.push({ script: item.name, reason: 'Multi-way drift in critical script', classification: 'RISK' });
    }
  }

  // Build report
  const lines = [
    provenanceBlock(`drift-sweep-${dateStamp}`),
    `# Cross-Lane Drift Sweep Report — ${dateStamp}`,
    '',
    `**Runner version:** ${RUNNER_VERSION}`,
    `**Lanes checked:** ${LANE_NAMES.join(', ')}`,
    `**Items checked:** ${allItems.length} (${scriptNames.length} scripts + ${utilModules.length} util modules)`,
    '',
    '## Summary',
    '',
    '| Classification | Count |',
    '|----------------|-------|',
    '| OK (consistent) | ' + matched.length + ' |',
    '| NEEDS_SYNC | ' + drift.filter(d => d.classification === 'NEEDS_SYNC').length + ' |',
    '| RISK | ' + drift.filter(d => d.classification === 'RISK').length + ' |',
    '| MISSING | ' + drift.filter(d => d.classification === 'MISSING').length + ' |',
    '',
  ];

  if (drift.length > 0) {
    lines.push('## Drift Findings', '');
    for (const d of drift) {
      lines.push(`### ${d.script} — ${d.classification}`);
      lines.push(`- Detail: ${d.detail}`);
      for (const [ln, h] of Object.entries(d.per_lane || {})) {
        lines.push(`  - ${ln}: ${h === 'MISSING' ? '**MISSING**' : h.slice(0, 12) + '...'}`);
      }
      lines.push('');
    }
  }

  if (escalations.length > 0) {
    lines.push('## Escalations Required', '');
    for (const e of escalations) {
      lines.push(`- **${e.script}**: ${e.reason} (${e.classification})`);
    }
    lines.push('');
  }

  if (matched.length > 0) {
    lines.push('## Consistent Scripts', '');
    for (const m of matched) {
      lines.push(`- ${m.script}: \`${m.hash.slice(0, 12)}...\``);
    }
    lines.push('');
  }

  const reportContent = lines.join('\n');

  if (apply) {
    ensureDir(REPORTS_DIR);
    fs.writeFileSync(artifactPath, reportContent, 'utf8');
    incTelemetry('drift_findings_created', drift.length);
  }

  console.log(`[offline-runner] duty=swarm-night-drift-sweep status=success artifact=${apply ? artifactPath : '(dry-run)'} time=${Date.now() - t0}ms`);

  return {
    id: 'swarm-night-drift-sweep',
    success: true,
    artifact: apply ? artifactPath : null,
    findings: drift.length,
    escalations: escalations.length,
  };
}

// ---------------------------------------------------------------------------
// S2 — Watcher/heartbeat health audit
// ---------------------------------------------------------------------------

function runWatcherHealthAudit(apply) {
  const t0 = Date.now();
  const dateStamp = todayStamp();
  const artifactPath = path.join(REPORTS_DIR, `watcher-health-${dateStamp}.md`);
  const findings = [];
  const escalations = [];
  const now = Date.now();

  // Heartbeat freshness
  const INBOX_DIR = path.join(SWARM_ROOT, 'lanes', LANE, 'inbox');
  const hbPath = path.join(INBOX_DIR, `heartbeat-${LANE}.json`);
  const hbData = safeReadJson(hbPath);
  if (hbData) {
    const hbTs = hbData.timestamp ? new Date(hbData.timestamp).getTime() : 0;
    const ageMin = Math.round((now - hbTs) / 60000);
    if (ageMin <= 15) {
      findings.push({ severity: 'PASS', area: 'heartbeat', detail: `Fresh (${ageMin} min ago)` });
    } else if (ageMin <= 60) {
      findings.push({ severity: 'WARN', area: 'heartbeat', detail: `Stale (${ageMin} min ago, threshold 15)` });
    } else {
      findings.push({ severity: 'FAIL', area: 'heartbeat', detail: `Very stale (${ageMin} min ago, threshold 15)` });
      escalations.push({ area: 'heartbeat', reason: `Heartbeat ${ageMin} min stale` });
    }
  } else {
    findings.push({ severity: 'FAIL', area: 'heartbeat', detail: 'No heartbeat file found in inbox' });
    escalations.push({ area: 'heartbeat', reason: 'Missing heartbeat file in inbox' });
  }

  // Watcher log errors
  const watcherLog = path.join(SWARM_ROOT, 'scripts', 'inbox-watcher.log');
  let errorCount = 0;
  let errorSample = [];
  if (fs.existsSync(watcherLog)) {
    try {
      const logLines = fs.readFileSync(watcherLog, 'utf8').split('\n').slice(-50);
      const errors = logLines.filter(l => /\bERROR\b|\bFAIL\b|\bCRASH\b/i.test(l));
      errorCount = errors.length;
      errorSample = errors.slice(0, 3);
      if (errorCount > 5) {
        findings.push({ severity: 'FAIL', area: 'watcher_log', detail: `${errorCount} error lines in last 50 log lines` });
        escalations.push({ area: 'watcher_log', reason: `${errorCount} errors in watcher log` });
      } else if (errorCount > 0) {
        findings.push({ severity: 'WARN', area: 'watcher_log', detail: `${errorCount} error lines in last 50 log lines`, sample: errorSample });
      } else {
        findings.push({ severity: 'PASS', area: 'watcher_log', detail: 'No errors in last 50 log lines' });
      }
    } catch (_) {
      findings.push({ severity: 'WARN', area: 'watcher_log', detail: 'Could not read watcher log' });
    }
  } else {
    findings.push({ severity: 'INFO', area: 'watcher_log', detail: 'No watcher log file' });
  }

  // Wake packet freshness
  const wakePath = path.join(STATE_DIR, 'codex-wake-packet.json');
  const wakeData = safeReadJson(wakePath);
  if (wakeData) {
    const wakeTs = wakeData.generated_at ? new Date(wakeData.generated_at).getTime() : 0;
    const ageH = Math.round((now - wakeTs) / 3600000);
    if (ageH <= 24) {
      findings.push({ severity: 'PASS', area: 'wake_packet', detail: `Fresh (${ageH}h ago), pending=${wakeData.pending_count || 0}` });
    } else {
      findings.push({ severity: 'WARN', area: 'wake_packet', detail: `Stale (${ageH}h ago, threshold 24h)` });
    }
  } else {
    findings.push({ severity: 'INFO', area: 'wake_packet', detail: 'No wake packet file found' });
  }

  // Agent active lock staleness
  const activeLock = path.join(STATE_DIR, 'agent-active.lock');
  const lockAge = fileAgeMinutes(activeLock);
  if (lockAge !== null) {
    if (lockAge > 30) {
      findings.push({ severity: 'WARN', area: 'agent_active_lock', detail: `Lock ${lockAge} min old (threshold 30), possible stale session` });
    } else {
      findings.push({ severity: 'PASS', area: 'agent_active_lock', detail: `Lock ${lockAge} min old (recent)` });
    }
  } else {
    findings.push({ severity: 'INFO', area: 'agent_active_lock', detail: 'No active lock (idle)' });
  }

  // Scheduled tasks (Windows only)
  if (process.platform === 'win32') {
    for (const taskName of ['SwarmMindHeartbeat', 'SwarmMindWatcher']) {
      try {
        const output = execSync(
          `powershell -NoProfile -Command "Get-ScheduledTaskInfo -TaskName '${taskName}' | ConvertTo-Json"`,
          { timeout: 15000, encoding: 'utf8' }
        );
        const info = JSON.parse(output);
        if (info.LastTaskResult === 0 || info.LastTaskResult === 267009) {
          findings.push({ severity: 'PASS', area: 'scheduled_task', detail: `${taskName}: LastResult=${info.LastTaskResult}` });
        } else {
          findings.push({ severity: 'WARN', area: 'scheduled_task', detail: `${taskName}: LastResult=${info.LastTaskResult}` });
        }
      } catch (e) {
        findings.push({ severity: 'INFO', area: 'scheduled_task', detail: `${taskName}: not queryable (${e.message.slice(0, 80)})` });
      }
    }
  }

  // Inbox state
  const inboxState = {};
  for (const sub of ['action-required', 'blocked', 'quarantine', 'processed']) {
    const subDir = path.join(SWARM_ROOT, 'lanes', LANE, 'inbox', sub);
    inboxState[sub] = countJson(subDir);
  }
  findings.push({ severity: 'INFO', area: 'inbox_state', detail: JSON.stringify(inboxState) });

  // Build report
  const lines = [
    provenanceBlock(`watcher-health-${dateStamp}`),
    `# Watcher Health Audit Report — ${dateStamp}`,
    '',
    `**Runner version:** ${RUNNER_VERSION}`,
    `**Lane:** ${LANE}`,
    '',
    '## Findings',
    '',
    '| Severity | Area | Detail |',
    '|----------|------|--------|',
  ];
  for (const f of findings) {
    lines.push(`| ${f.severity} | ${f.area} | ${f.detail} |`);
  }
  lines.push('');

  if (escalations.length > 0) {
    lines.push('## Escalations Required', '');
    for (const e of escalations) {
      lines.push(`- **${e.area}**: ${e.reason}`);
    }
    lines.push('');
  }

  lines.push('## Inbox State', '');
  lines.push('```json');
  lines.push(JSON.stringify(inboxState, null, 2));
  lines.push('```');
  lines.push('');

  const reportContent = lines.join('\n');

  if (apply) {
    ensureDir(REPORTS_DIR);
    fs.writeFileSync(artifactPath, reportContent, 'utf8');
  }

  console.log(`[offline-runner] duty=swarm-night-watcher-health status=success artifact=${apply ? artifactPath : '(dry-run)'} time=${Date.now() - t0}ms`);

  return {
    id: 'swarm-night-watcher-health',
    success: true,
    artifact: apply ? artifactPath : null,
    findings: findings.length,
    escalations: escalations.length,
  };
}

// ---------------------------------------------------------------------------
// S3 — Robustness regression scan
// ---------------------------------------------------------------------------

function runRobustnessScan(apply) {
  const t0 = Date.now();
  const dateStamp = todayStamp();
  const artifactPath = path.join(REPORTS_DIR, `robustness-scan-${dateStamp}.md`);
  const now = Date.now();
  const findings = [];
  const escalations = [];

  // Scan processed/ for unverified items
  const procDir = path.join(SWARM_ROOT, 'lanes', LANE, 'inbox', 'processed');
  let unverifiedCount = 0;
  if (fs.existsSync(procDir)) {
    const files = fs.readdirSync(procDir).filter(f => f.endsWith('.json') && !f.toLowerCase().startsWith('heartbeat'));
    for (const f of files) {
      const data = safeReadJson(path.join(procDir, f));
      if (data && data.execution_verified === false) {
        unverifiedCount++;
      }
    }
  }
  if (unverifiedCount > 0) {
    findings.push({ severity: 'HIGH', area: 'processed_unverified', count: unverifiedCount, detail: `${unverifiedCount} processed items with execution_verified=false` });
  }

  // Scan blocked/ for items older than 24h
  const blockedDir = path.join(SWARM_ROOT, 'lanes', LANE, 'inbox', 'blocked');
  let staleBlocked = 0;
  if (fs.existsSync(blockedDir)) {
    const files = fs.readdirSync(blockedDir).filter(f => f.endsWith('.json') && !f.toLowerCase().startsWith('heartbeat'));
    for (const f of files) {
      const age = fileAgeMinutes(path.join(blockedDir, f));
      if (age !== null && age > 1440) {
        staleBlocked++;
      }
    }
  }
  if (staleBlocked > 0) {
    findings.push({ severity: 'MEDIUM', area: 'blocked_stale', count: staleBlocked, detail: `${staleBlocked} blocked items older than 24h` });
  }

  // Scan quarantine/ for FORMAT_VIOLATION or SCHEMA_INVALID
  const quarantineDir = path.join(SWARM_ROOT, 'lanes', LANE, 'inbox', 'quarantine');
  let formatViolations = 0;
  if (fs.existsSync(quarantineDir)) {
    const files = fs.readdirSync(quarantineDir).filter(f => f.endsWith('.json') && !f.toLowerCase().startsWith('heartbeat'));
    for (const f of files) {
      const data = safeReadJson(path.join(quarantineDir, f));
      if (data && (data.quarantine_reason === 'FORMAT_VIOLATION' || data.quarantine_reason === 'SCHEMA_INVALID')) {
        formatViolations++;
      }
    }
  }
  if (formatViolations > 0) {
    findings.push({ severity: 'CRITICAL', area: 'quarantine_format_violation', count: formatViolations, detail: `${formatViolations} quarantine items with FORMAT_VIOLATION or SCHEMA_INVALID` });
    escalations.push({ area: 'quarantine', reason: `${formatViolations} format/schema violations in quarantine` });
  }

  // Scan outbox/ for unsigned messages or missing convergence_gate
  const outboxDir = path.join(SWARM_ROOT, 'lanes', LANE, 'outbox');
  let unsignedOutbox = 0;
  let missingGate = 0;
  if (fs.existsSync(outboxDir)) {
    const files = fs.readdirSync(outboxDir).filter(f => f.endsWith('.json') && !f.toLowerCase().startsWith('heartbeat'));
    for (const f of files) {
      const data = safeReadJson(path.join(outboxDir, f));
      if (data) {
        if (!data.signature && !data._signature) unsignedOutbox++;
        if (!data.convergence_gate && !data._convergence_gate) missingGate++;
      }
    }
  }
  if (unsignedOutbox > 0) {
    findings.push({ severity: 'CRITICAL', area: 'outbox_unsigned', count: unsignedOutbox, detail: `${unsignedOutbox} unsigned messages in outbox` });
    escalations.push({ area: 'outbox', reason: `${unsignedOutbox} unsigned outbox messages` });
  }
  if (missingGate > 0) {
    findings.push({ severity: 'HIGH', area: 'outbox_missing_gate', count: missingGate, detail: `${missingGate} outbox messages missing convergence_gate` });
  }

  // Check worker-audit.log for repeated error patterns
  const auditLogPath = path.join(STATE_DIR, 'worker-audit.log');
  let repeatedPatterns = 0;
  const patternCounts = {};
  if (fs.existsSync(auditLogPath)) {
    try {
      const logContent = fs.readFileSync(auditLogPath, 'utf8');
      const errorLines = logContent.split('\n').filter(l => /\bERROR\b|\bFAIL\b/i.test(l));
      for (const line of errorLines) {
        // Extract simplified reason (first 60 chars of error content)
        const simplified = line.replace(/^\S+\s+\S+\s+/, '').slice(0, 60).trim();
        if (simplified) {
          patternCounts[simplified] = (patternCounts[simplified] || 0) + 1;
        }
      }
      for (const [pattern, count] of Object.entries(patternCounts)) {
        if (count > 3) {
          repeatedPatterns++;
          findings.push({ severity: 'MEDIUM', area: 'worker_audit_repeated', pattern: pattern.slice(0, 80), count, detail: `Error pattern repeated ${count} times: "${pattern.slice(0, 60)}"` });
        }
      }
    } catch (_) { /* ignore log read errors */ }
  }

  // Build report
  const lines = [
    provenanceBlock(`robustness-scan-${dateStamp}`),
    `# Robustness Regression Scan Report — ${dateStamp}`,
    '',
    `**Runner version:** ${RUNNER_VERSION}`,
    `**Lane:** ${LANE}`,
    '',
    '## Findings',
    '',
    '| Severity | Area | Count | Detail |',
    '|----------|------|-------|--------|',
  ];
  for (const f of findings) {
    lines.push(`| ${f.severity} | ${f.area} | ${f.count || '-'} | ${f.detail} |`);
  }
  lines.push('');

  if (escalations.length > 0) {
    lines.push('## Escalations Required', '');
    for (const e of escalations) {
      lines.push(`- **${e.area}**: ${e.reason}`);
    }
    lines.push('');
  }

  const critCount = findings.filter(f => f.severity === 'CRITICAL').length;
  const highCount = findings.filter(f => f.severity === 'HIGH').length;
  const medCount = findings.filter(f => f.severity === 'MEDIUM').length;

  lines.push('## Summary', '');
  lines.push(`- CRITICAL: ${critCount}`);
  lines.push(`- HIGH: ${highCount}`);
  lines.push(`- MEDIUM: ${medCount}`);
  lines.push(`- Total findings: ${findings.length}`);
  lines.push('');

  const reportContent = lines.join('\n');

  if (apply) {
    ensureDir(REPORTS_DIR);
    fs.writeFileSync(artifactPath, reportContent, 'utf8');
  }

  console.log(`[offline-runner] duty=swarm-night-robustness-scan status=success artifact=${apply ? artifactPath : '(dry-run)'} time=${Date.now() - t0}ms`);

  return {
    id: 'swarm-night-robustness-scan',
    success: true,
    artifact: apply ? artifactPath : null,
    findings: findings.length,
    escalations: escalations.length,
  };
}

// ---------------------------------------------------------------------------
// S4 — Cross-lane stale work detection
// ---------------------------------------------------------------------------

function runStaleWorkDetection(apply) {
  const t0 = Date.now();
  const dateStamp = todayStamp();
  const artifactPath = path.join(REPORTS_DIR, `stale-work-${dateStamp}.md`);
  const now = Date.now();
  const escalations = [];
  const laneResults = {};

  for (const ln of LANE_NAMES) {
    const laneRoot = ROOTS[ln];
    const laneResult = { action_required: { total: 0, stale_12h: 0, stale_24h: 0, stale_48h: 0, stale_72h: 0 }, blocked: { total: 0, stale_24h: 0 }, quarantine: { total: 0, stale_48h: 0 }, outbox: { total: 0, undelivered: 0 }, processed_missing_gate: 0 };

    // action-required
    const arDir = path.join(laneRoot, 'lanes', ln, 'inbox', 'action-required');
    if (fs.existsSync(arDir)) {
      const files = fs.readdirSync(arDir).filter(f => f.endsWith('.json') && !f.toLowerCase().startsWith('heartbeat'));
      laneResult.action_required.total = files.length;
      for (const f of files) {
        const age = fileAgeMinutes(path.join(arDir, f));
        if (age !== null) {
          if (age > 720) laneResult.action_required.stale_12h++;
          if (age > 1440) laneResult.action_required.stale_24h++;
          if (age > 2880) laneResult.action_required.stale_48h++;
          if (age > 4320) {
            laneResult.action_required.stale_72h++;
            escalations.push({ lane: ln, area: 'action-required', file: f, age_min: age, reason: `Action-required item ${age} min old (>72h)` });
          }
        }
      }
    }

    // blocked
    const blockedDir = path.join(laneRoot, 'lanes', ln, 'inbox', 'blocked');
    if (fs.existsSync(blockedDir)) {
      const files = fs.readdirSync(blockedDir).filter(f => f.endsWith('.json') && !f.toLowerCase().startsWith('heartbeat'));
      laneResult.blocked.total = files.length;
      for (const f of files) {
        const age = fileAgeMinutes(path.join(blockedDir, f));
        if (age !== null && age > 1440) {
          laneResult.blocked.stale_24h++;
        }
      }
    }

    // quarantine
    const quarantineDir = path.join(laneRoot, 'lanes', ln, 'inbox', 'quarantine');
    if (fs.existsSync(quarantineDir)) {
      const files = fs.readdirSync(quarantineDir).filter(f => f.endsWith('.json') && !f.toLowerCase().startsWith('heartbeat'));
      laneResult.quarantine.total = files.length;
      for (const f of files) {
        const age = fileAgeMinutes(path.join(quarantineDir, f));
        if (age !== null && age > 2880) {
          laneResult.quarantine.stale_48h++;
        }
      }
    }

    // outbox (undelivered items with no delivery receipt)
    const outboxDir = path.join(laneRoot, 'lanes', ln, 'outbox');
    if (fs.existsSync(outboxDir)) {
      const files = fs.readdirSync(outboxDir).filter(f => f.endsWith('.json') && !f.toLowerCase().startsWith('heartbeat') && !f.startsWith('receipt-'));
      laneResult.outbox.total = files.length;
      for (const f of files) {
        const data = safeReadJson(path.join(outboxDir, f));
        if (data && !data.evidence_exchange) {
          laneResult.outbox.undelivered++;
        }
      }
    }

    // processed missing convergence_gate
    const procDir = path.join(laneRoot, 'lanes', ln, 'inbox', 'processed');
    if (fs.existsSync(procDir)) {
      const files = fs.readdirSync(procDir).filter(f => f.endsWith('.json') && !f.toLowerCase().startsWith('heartbeat'));
      for (const f of files) {
        const data = safeReadJson(path.join(procDir, f));
        if (data && !data.convergence_gate && !data._convergence_gate) {
          laneResult.processed_missing_gate++;
        }
      }
    }

    laneResults[ln] = laneResult;
  }

  // Build report
  const lines = [
    provenanceBlock(`stale-work-${dateStamp}`),
    `# Cross-Lane Stale Work Detection Report — ${dateStamp}`,
    '',
    `**Runner version:** ${RUNNER_VERSION}`,
    `**Lanes scanned:** ${LANE_NAMES.join(', ')}`,
    '',
    '## Per-Lane Stale Work Summary',
    '',
    '| Lane | Action-Required (total/12h/24h/48h/72h+) | Blocked (total/24h+) | Quarantine (total/48h+) | Outbox (total/undelivered) | Processed Missing Gate |',
    '|------|-------------------------------------------|---------------------|------------------------|----------------------------|----------------------|',
  ];

  for (const ln of LANE_NAMES) {
    const r = laneResults[ln];
    lines.push(`| ${ln} | ${r.action_required.total}/${r.action_required.stale_12h}/${r.action_required.stale_24h}/${r.action_required.stale_48h}/${r.action_required.stale_72h} | ${r.blocked.total}/${r.blocked.stale_24h} | ${r.quarantine.total}/${r.quarantine.stale_48h} | ${r.outbox.total}/${r.outbox.undelivered} | ${r.processed_missing_gate} |`);
  }
  lines.push('');

  if (escalations.length > 0) {
    lines.push('## Escalations Required (72h+ items)', '');
    for (const e of escalations) {
      lines.push(`- **[${e.lane}]** ${e.area}/${e.file}: ${e.reason}`);
    }
    lines.push('');
  }

  const reportContent = lines.join('\n');

  if (apply) {
    ensureDir(REPORTS_DIR);
    fs.writeFileSync(artifactPath, reportContent, 'utf8');
    incTelemetry('stale_items_escalated', escalations.length);
  }

  console.log(`[offline-runner] duty=swarm-night-stale-work status=success artifact=${apply ? artifactPath : '(dry-run)'} time=${Date.now() - t0}ms`);

  return {
    id: 'swarm-night-stale-work',
    success: true,
    artifact: apply ? artifactPath : null,
    findings: Object.values(laneResults).reduce((sum, r) => sum + r.action_required.stale_12h + r.blocked.stale_24h + r.quarantine.stale_48h, 0),
    escalations: escalations.length,
  };
}

// ---------------------------------------------------------------------------
// S5 — Wake-packet enrichment
// ---------------------------------------------------------------------------

function runWakePacketEnrichment(apply, priorDutyResults) {
  const t0 = Date.now();
  const wakePath = path.join(STATE_DIR, 'codex-wake-packet.json');
  const packet = safeReadJson(wakePath);

  if (!packet) {
    console.log(`[offline-runner] duty=swarm-night-wake-enrichment status=skipped artifact=null time=${Date.now() - t0}ms — no wake packet found`);
    return { id: 'swarm-night-wake-enrichment', success: false, artifact: null, findings: 0, escalations: 0, error: 'no wake packet' };
  }

  // Enrich each pending item
  if (Array.isArray(packet.pending)) {
    for (const item of packet.pending) {
      // Add evidence_location
      item.evidence_location = item.file || null;
      // Add recommended_first_command
      if (item.requires_codex) {
        item.recommended_first_command = `node scripts/codex-wake-packet.js --apply`;
      } else if (item.priority === 'P0' || item.priority === 'P1') {
        item.recommended_first_command = `node scripts/lane-worker.js --lane swarmmind --apply`;
      } else {
        item.recommended_first_command = `node scripts/generic-task-executor.js swarmmind --apply`;
      }
      // Add safe_autonomous flag
      item.safe_autonomous = !item.requires_codex && !item.requires_action;
    }
  }

  // Add offline_findings section summarizing S1-S4 results
  const offlineFindings = {};
  for (const result of priorDutyResults) {
    if (result.id && result.success) {
      offlineFindings[result.id] = {
        findings: result.findings || 0,
        escalations: result.escalations || 0,
        artifact: result.artifact || null,
      };
    }
  }
  packet.offline_findings = offlineFindings;

  // Add next_session_recommendation
  const allEscalations = priorDutyResults.reduce((sum, r) => sum + (r.escalations || 0), 0);
  const arCount = countJson(path.join(SWARM_ROOT, 'lanes', LANE, 'inbox', 'action-required'));

  if (arCount > 0) {
    packet.next_session_recommendation = 'Process action-required inbox items (highest priority)';
  } else if (allEscalations > 0) {
    packet.next_session_recommendation = 'Review offline duty escalations from today\'s reports';
  } else {
    packet.next_session_recommendation = 'No urgent items — routine maintenance or feature work';
  }

  packet.enriched_at = nowIso();
  packet.enriched_by = `swarm-offline-runner/${RUNNER_VERSION}`;

  if (apply) {
    safeWriteJson(wakePath, packet);
    incTelemetry('wake_packets_enriched', 1);
  }

  console.log(`[offline-runner] duty=swarm-night-wake-enrichment status=success artifact=${apply ? wakePath : '(dry-run)'} time=${Date.now() - t0}ms`);

  return {
    id: 'swarm-night-wake-enrichment',
    success: true,
    artifact: apply ? wakePath : null,
    findings: (packet.pending || []).length,
    escalations: 0,
  };
}

// ---------------------------------------------------------------------------
// Readiness report
// ---------------------------------------------------------------------------

function generateReadinessReport(dutyResults, telemetry, apply) {
  const dateStamp = todayStamp();
  const artifactPath = path.join(REPORTS_DIR, 'SWARM_OFFLINE_READINESS_REPORT.md');

  const lines = [
    provenanceBlock(`SWARM_OFFLINE_READINESS_REPORT-${dateStamp}`),
    `# SwarmMind Offline Readiness Report — ${dateStamp}`,
    '',
    `**Runner version:** ${RUNNER_VERSION}`,
    `**Mode:** ${apply ? 'APPLY' : 'DRY-RUN'}`,
    `**Duties run:** ${dutyResults.length}`,
    '',
    '## Duty Results',
    '',
    '| Duty ID | Status | Findings | Escalations | Artifact |',
    '|---------|--------|----------|-------------|----------|',
  ];

  for (const r of dutyResults) {
    lines.push(`| ${r.id} | ${r.success ? '✅ success' : '❌ failure'} | ${r.findings || 0} | ${r.escalations || 0} | ${r.artifact || '(none)'} |`);
  }
  lines.push('');

  const totalEscalations = dutyResults.reduce((s, r) => s + (r.escalations || 0), 0);

  if (totalEscalations > 0) {
    lines.push('## Escalations Required', '');
    for (const r of dutyResults) {
      if (r.escalations > 0) {
        lines.push(`- **${r.id}**: ${r.escalations} escalation(s)`);
      }
    }
    lines.push('');
  }

  lines.push('## Telemetry Snapshot', '');
  lines.push('```json');
  lines.push(JSON.stringify(telemetry, null, 2));
  lines.push('```');
  lines.push('');

  // Next session recommendation
  const anyFailure = dutyResults.some(r => !r.success);
  lines.push('## Next Session Recommendation', '');
  if (totalEscalations > 0) {
    lines.push('**Priority: Review offline duty escalations before starting new work.**');
  } else if (anyFailure) {
    lines.push('**Priority: Some duties failed — check logs and retry.**');
  } else {
    lines.push('**All duties passed. No urgent items. Ready for normal operation.**');
  }
  lines.push('');

  const convergenceGate = {
    claim: `SwarmMind offline runner completed ${dutyResults.length} duties with ${totalEscalations} escalations.`,
    evidence: artifactPath,
    verified_by: 'swarmmind',
    contradictions: [],
    status: totalEscalations > 0 ? 'conflicted' : 'proven',
  };

  lines.push('## Convergence Gate', '');
  lines.push('```json');
  lines.push(JSON.stringify(convergenceGate, null, 2));
  lines.push('```');
  lines.push('');

  const reportContent = lines.join('\n');

  if (apply) {
    ensureDir(REPORTS_DIR);
    fs.writeFileSync(artifactPath, reportContent, 'utf8');
  }

  return { artifact: apply ? artifactPath : null, convergenceGate };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const dryRun = !apply;
  const dutyFlagIdx = argv.indexOf('--duty');
  const dutyFilter = dutyFlagIdx >= 0 ? argv[dutyFlagIdx + 1] : null;

  console.log(`[offline-runner] Starting — mode=${apply ? 'APPLY' : 'DRY-RUN'} dutyFilter=${dutyFilter || 'all'} version=${RUNNER_VERSION}`);

  // Load night queue
  const queue = loadNightQueue();
  const eligibleItems = queue.filter(item =>
    item.enabled &&
    item.safe_offline === true &&
    item.requires_model === false &&
    item.requires_operator === false &&
    (!dutyFilter || item.id === dutyFilter)
  );

  if (eligibleItems.length === 0) {
    console.log('[offline-runner] No eligible duties to run.');
    if (dryRun) console.log('[offline-runner] Use --apply to execute duties.');
    return;
  }

  console.log(`[offline-runner] Eligible duties: ${eligibleItems.map(i => i.id).join(', ')}`);

  const dutyResults = [];
  const dutyMap = {
    'swarm-night-drift-sweep': runDriftSweep,
    'swarm-night-watcher-health': runWatcherHealthAudit,
    'swarm-night-robustness-scan': runRobustnessScan,
    'swarm-night-stale-work': runStaleWorkDetection,
    // wake-enrichment runs last, after S1-S4
  };

  // Run S1-S4 first (in queue order)
  for (const item of eligibleItems) {
    if (item.id === 'swarm-night-wake-enrichment') continue; // run last
    const fn = dutyMap[item.id];
    if (!fn) {
      console.log(`[offline-runner] duty=${item.id} status=skipped — no implementation mapped`);
      dutyResults.push({ id: item.id, success: false, artifact: null, findings: 0, escalations: 0, error: 'no implementation' });
      continue;
    }

    try {
      const result = fn(apply);
      dutyResults.push(result);

      // Update night queue item
      item.last_run_at = nowIso();
      item.last_result = result.success ? 'success' : 'failure';
      item.last_artifact_path = result.artifact || null;
    } catch (e) {
      console.log(`[offline-runner] duty=${item.id} status=failure error=${e.message}`);
      dutyResults.push({ id: item.id, success: false, artifact: null, findings: 0, escalations: 0, error: e.message });
      item.last_run_at = nowIso();
      item.last_result = `failure: ${e.message.slice(0, 80)}`;
    }
  }

  // Run S5 (wake-enrichment) with prior results
  const wakeItem = eligibleItems.find(i => i.id === 'swarm-night-wake-enrichment');
  if (wakeItem) {
    try {
      const result = runWakePacketEnrichment(apply, dutyResults);
      dutyResults.push(result);
      wakeItem.last_run_at = nowIso();
      wakeItem.last_result = result.success ? 'success' : 'failure';
      wakeItem.last_artifact_path = result.artifact || null;
    } catch (e) {
      console.log(`[offline-runner] duty=swarm-night-wake-enrichment status=failure error=${e.message}`);
      dutyResults.push({ id: 'swarm-night-wake-enrichment', success: false, artifact: null, findings: 0, escalations: 0, error: e.message });
      wakeItem.last_run_at = nowIso();
      wakeItem.last_result = `failure: ${e.message.slice(0, 80)}`;
    }
  }

  // Update night queue file
  if (apply) {
    saveNightQueue(queue);
  }

  // Update telemetry
  const telemetry = incTelemetry('offline_checks_run', dutyResults.filter(r => r.success).length);

  // Generate readiness report
  const reportResult = generateReadinessReport(dutyResults, telemetry, apply);

  console.log(`[offline-runner] Complete — ${dutyResults.filter(r => r.success).length}/${dutyResults.length} duties succeeded`);
  console.log(`[offline-runner] Readiness report: ${reportResult.artifact || '(dry-run)'}`);
  console.log(`[offline-runner] Convergence gate: ${reportResult.convergenceGate.status}`);
}

main();
