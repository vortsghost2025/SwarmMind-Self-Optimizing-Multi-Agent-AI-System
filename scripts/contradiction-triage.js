#!/usr/bin/env node
/**
 * contradiction-triage.js
 * Autonomous contradiction detection and triage
 * Implements Paper 6 VDS (Verification Drift Score)
 *
 * Part of SwarmMind S1 drift-sweep (daily at 02:00 UTC)
 * Escalates RISK contradictions to Library for adjudication
 *
 * Generated: 2026-05-31T19:56:00Z
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BROADCAST_DIR = '/home/we4free/agent/repos/Archivist-Agent/lanes/broadcast';
const QUARANTINE_DIR = '/home/we4free/agent/repos/Archivist-Agent/lanes/archivist/inbox/quarantine';
const LIBRARY_INBOX = '/home/we4free/agent/repos/self-organizing-library/lanes/library/inbox';

const TIMESTAMP = new Date().toISOString();
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const VDS_THRESHOLD = 0.8;

function log(msg) {
  console.log(`[${TIMESTAMP}] contradiction-triage: ${msg}`);
}

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 30000 });
  } catch (err) {
    return `ERROR: ${err.message}`;
  }
}

function findContradictionFiles(dir) {
  try {
    const result = run(`find "${dir}" -type f -name "*.json" 2>/dev/null | head -200`);
    return result.split('\n').filter(f => f.trim());
  } catch (err) {
    return [];
  }
}

function analyzeContradiction(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(content);

    let vds = 0;
    let reasons = [];

    // Age score (older = higher drift risk)
    const age = Date.now() - new Date(data.timestamp || Date.now()).getTime();
    if (age > MAX_AGE_MS) {
      vds += 0.3;
      reasons.push('STALE_7D');
    }

    // Confidence score
    const confidence = data.confidence || data.evidence?.confidence || 5;
    if (confidence < 5) {
      vds += 0.2;
      reasons.push('LOW_CONFIDENCE');
    } else if (confidence < 7) {
      vds += 0.1;
      reasons.push('MEDIUM_CONFIDENCE');
    }

    // Missing evidence
    if (!data.evidence || !data.evidence.verified) {
      vds += 0.2;
      reasons.push('NO_VERIFICATION');
    }

    // Missing convergence gate
    if (!data.convergence_gate || data.convergence_gate.status === 'unproven') {
      vds += 0.2;
      reasons.push('NO_CONVERGENCE');
    }

    // Missing output provenance
    if (!data.OUTPUT_PROVENANCE) {
      vds += 0.1;
      reasons.push('NO_PROVENANCE');
    }

    const classification = vds >= VDS_THRESHOLD ? 'RISK' : vds >= 0.4 ? 'NEEDS_SYNC' : 'BENIGN';

    return {
      file,
      vds: Math.round(vds * 100) / 100,
      classification,
      reasons,
      confidence,
      status: data.status || data.convergence_gate?.status || 'unknown',
      timestamp: data.timestamp
    };
  } catch (err) {
    return {
      file,
      vds: 1.0,
      classification: 'RISK',
      reasons: ['PARSE_ERROR'],
      error: err.message
    };
  }
}

async function quarantineFile(file, reason) {
  try {
    const filename = path.basename(file);
    const quarantinePath = path.join(QUARANTINE_DIR, `triage_${Date.now()}_${filename}`);
    fs.renameSync(file, quarantinePath);
    log(`Quarantined: ${filename} -> ${path.basename(quarantinePath)}`);
    return true;
  } catch (err) {
    log(`ERROR quarantining ${file}: ${err.message}`);
    return false;
  }
}

async function escalateToLibrary(item) {
  try {
    const escalation = {
      schema_version: "1.3",
      task_id: `contradiction-escalation-${Date.now()}`,
      idempotency_key: `contradiction-escalation-${Date.now()}`,
      from: "swarmmind",
      to: "library",
      type: "task",
      task_kind: "handoff",
      priority: "P1",
      subject: `[ESCALATION] Contradiction requires adjudication: ${item.classification}`,
      body: JSON.stringify(item, null, 2),
      timestamp: new Date().toISOString(),
      requires_action: true,
      confidence: 3,
      payload: {
        mode: "inline",
        compression: "none"
      },
      execution: {
        mode: "manual",
        engine: "swarmmind",
        actor: "lane"
      },
      evidence: {
        required: true,
        verified: false
      },
      OUTPUT_PROVENANCE: {
        agent: "swarmmind/contradiction-triage",
        lane: "swarmmind",
        generated_at: new Date().toISOString(),
        session_id: "swarmmind-autonomous"
      }
    };

    const filename = `${Date.now()}_swarmmind_${escalation.task_id}.json`;
    const outboxPath = path.join(LIBRARY_INBOX, filename);
    fs.writeFileSync(outboxPath, JSON.stringify(escalation, null, 2));
    log(`Escalated to Library: ${filename}`);
    return true;
  } catch (err) {
    log(`ERROR escalating to Library: ${err.message}`);
    return false;
  }
}

async function main() {
  log('=== Contradiction Triage STARTED ===');

  // Scan for contradiction files
  const searchDirs = [
    '/home/we4free/agent/repos/Archivist-Agent/lanes/archivist/inbox',
    '/home/we4free/agent/repos/SwarmMind/lanes/swarmmind/inbox',
    '/home/we4free/agent/repos/kernel-lane/lanes/kernel/inbox',
    '/home/we4free/agent/repos/self-organizing-library/lanes/library/inbox'
  ];

  const allFiles = [];
  for (const dir of searchDirs) {
    const files = findContradictionFiles(dir);
    allFiles.push(...files);
  }

  log(`Found ${allFiles.length} JSON files to analyze`);

  const results = {
    total: allFiles.length,
    BENIGN: 0,
    NEEDS_SYNC: 0,
    RISK: 0,
    quarantined: 0,
    escalated: 0
  };

  for (const file of allFiles) {
    const analysis = analyzeContradiction(file);
    results[analysis.classification]++;

    log(`[${analysis.classification}] ${path.basename(file)} VDS=${analysis.vds} reasons=${analysis.reasons.join(',')}`);

    if (analysis.classification === 'RISK') {
      // Auto-quarantine if very high risk
      if (analysis.vds >= 0.9) {
        if (await quarantineFile(file, analysis.reasons)) {
          results.quarantined++;
        }
      } else {
        // Escalate to Library for adjudication
        if (await escalateToLibrary(analysis)) {
          results.escalated++;
        }
      }
    }
  }

  // Write summary report
  const report = {
    timestamp: TIMESTAMP,
    scan_results: results,
    vds_threshold: VDS_THRESHOLD,
    max_age_days: 7
  };

  const reportPath = '/home/we4free/agent/repos/SwarmMind/reports/swarm/contradiction-triage-latest.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log(`Report saved to ${reportPath}`);

  log(`=== Contradiction Triage COMPLETE ===`);
  log(`Total: ${results.total} | BENIGN: ${results.BENIGN} | NEEDS_SYNC: ${results.NEEDS_SYNC} | RISK: ${results.RISK}`);
  log(`Quarantined: ${results.quarantined} | Escalated: ${results.escalated}`);

  return results;
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});