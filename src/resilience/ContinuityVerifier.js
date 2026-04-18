/**
 * Continuity Verifier
 *
 * On lane restart, verifies that the lane's continuity is intact:
 * - Fingerprint recompute (codebase hash)
 * - Lineage check (previous session state compatibility)
 * - Recovery status assignment (from RecoveryClassifier)
 *
 * If continuity is broken or recovery status requires quarantine,
 * the verifier can trigger gate HOLD and emit INCIDENT.
 *
 * Integration point: governed-start.js calls this after laneContextGate.initialize()
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { RecoveryClassifier } = require('./RecoveryClassifier');

class ContinuityVerifier {
  /**
   * @param {object} options
   * @param {LaneContextGate} options.gate - The lane gate instance
   * @param {string} options.projectRoot - Project root path
   * @param {string} options.stateDir - State directory for persisted continuity data
   */
  constructor(options = {}) {
    this.gate = options.gate;
    this.projectRoot = options.projectRoot || process.cwd();
    this.stateDir = options.stateDir || path.resolve(this.projectRoot, '.continuity');
    this.fingerprintFile = path.join(this.stateDir, 'fingerprint.json');
    this.lineageFile = path.join(this.stateDir, 'lineage.json');
    this._ensureStateDir();
  }

  _ensureStateDir() {
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }
  }

  /**
   * Compute current fingerprint of the codebase (hash of critical files)
   * Includes: laneContextGate.js, FilePermissionEnforcer.js, Queue.js, RecoveryClassifier.js
   * Also includes package.json lock if present.
   */
  computeFingerprint() {
    const hasher = crypto.createHash('sha256');
    const criticalFiles = [
      'src/core/laneContextGate.js',
      'src/permissions/FilePermissionEnforcer.js',
      'src/queue/Queue.js',
      'src/resilience/RecoveryClassifier.js',
      'src/resilience/RetryWrapper.js',
      'src/audit/AuditLogger.js',
      'src/attestation/IdentityAttestation.js',
      'package.json'
    ];
    for (const relPath of criticalFiles) {
      const abs = path.join(this.projectRoot, relPath);
      if (fs.existsSync(abs)) {
        const content = fs.readFileSync(abs);
        hasher.update(content);
        hasher.update('\n');  // separator
      }
    }
    return hasher.digest('hex');
  }

  /**
   * Load previous fingerprint and lineage
   */
  _loadStoredData() {
    let prevFp = null;
    let lineage = null;
    if (fs.existsSync(this.fingerprintFile)) {
      try { prevFp = JSON.parse(fs.readFileSync(this.fingerprintFile, 'utf8')).fingerprint; } catch (e) {}
    }
    if (fs.existsSync(this.lineageFile)) {
      try { lineage = JSON.parse(fs.readFileSync(this.lineageFile, 'utf8')); } catch (e) {}
    }
    return { prevFp, lineage };
  }

  /**
   * Save current fingerprint and lineage
   */
  _saveCurrentData(currentFp, lineage) {
    fs.writeFileSync(this.fingerprintFile, JSON.stringify({ fingerprint: currentFp, updated_at: new Date().toISOString() }, null, 2));
    fs.writeFileSync(this.lineageFile, JSON.stringify(lineage, null, 2));
  }

  /**
   * Run continuity verification at startup
   * @returns {object} verification result { ok, status, details }
   */
   verify() {
     const currentFp = this.computeFingerprint();
     const { prevFp, lineage } = this._loadStoredData();
     // Pass the same stateDir to RecoveryClassifier so it reads the correct state
     const recovery = new RecoveryClassifier({ laneId: process.env.LANE_NAME || 'unknown', stateDir: this.stateDir });
     const recoveryStatus = recovery.getStatus();

    const result = {
      timestamp: new Date().toISOString(),
      fingerprint_changed: prevFp ? (currentFp !== prevFp) : null,
      previous_fingerprint: prevFp,
      current_fingerprint: currentFp,
      lineage,
      recovery_status: recoveryStatus.current_classification,
      is_quarantined: recovery.isQuarantined(),
      needs_operator: recoveryStatus.needs_operator,
      action: null,
      details: {}
    };

    // Decision logic
    if (recovery.isQuarantined()) {
      result.action = 'QUARANTINE';
      result.details.reason = 'Recovery classifier indicates quarantine required';
      this._triggerHold('continuity_quarantine', `Lane in recovery quarantine until ${recoveryStatus.quarantine_until}`);
      return result;
    }

    if (prevFp && currentFp !== prevFp) {
      // Fingerprint changed — codebase drift detected
      result.action = 'DRIFT_DETECTED';
      result.details.reason = 'Codebase fingerprint changed from previous session';
      // Not necessarily a HOLD yet, but flag for operator review
      this._recordIncident('fingerprint_drift', { previous: prevFp, current: currentFp });
      // Do not block startup; but mark needs_operator
    }

    if (recoveryStatus.current_classification === 'lane_degradation') {
      result.action = 'LANE_DEGRADATION';
      result.details.reason = 'Recovery classifier indicates lane degradation';
      this._triggerHold('lane_degradation', 'Lane degradation detected — operator resolution required');
      return result;
    }

    if (recoveryStatus.current_classification === 'recovery_required') {
      result.action = 'REVIEW_NEEDED';
      result.details.reason = 'Repeated failures — operator review recommended';
      // Continue but flag
    }

    // Default: continue (only if no action set)
    if (!result.action) {
      result.action = 'CONTINUE';
    }

    // Save current fingerprint and update lineage
    const newLineage = {
      last_session: lineage ? lineage.last_session : null,
      current_session: {
        started_at: new Date().toISOString(),
        fingerprint: currentFp,
        recovery_classification: recoveryStatus.current_classification
      },
      drift_history: (lineage ? lineage.drift_history : []).concat({
        timestamp: new Date().toISOString(),
        fingerprint: currentFp,
        classification: recoveryStatus.current_classification
      }).slice(-10)  // keep last 10
    };
    this._saveCurrentData(currentFp, newLineage);

    // Audit
    const { AuditLogger, audit } = require('../audit/AuditLogger');
    audit.record({
      type: 'continuity_verified',
      queueType: null,
      itemId: null,
      details: {
        lane: process.env.LANE_NAME,
        action: result.action,
        fingerprint_changed: result.fingerprint_changed,
        recovery_classification: recoveryStatus.current_classification
      }
    });

    return result;
  }

  /**
   * Trigger HOLD via lane gate
   */
  _triggerHold(reason, message) {
    if (this.gate && this.gate.enterHold) {
      this.gate.enterHold(reason, new Error(message));
    } else {
      console.error('[Continuity] HOLD requested but gate unavailable:', message);
    }
    // Also emit INCIDENT
    this._recordIncident(reason, { message });
  }

  /**
   * Emit an INCIDENT queue item
   */
  _recordIncident(type, details) {
    try {
      const Queue = require('../queue/Queue');
      const incidentQueue = new Queue('INCIDENT');
      incidentQueue.enqueue({
        target_lane: 'archivist',
        type: 'incident_report',
        artifact_path: null,
        required_action: 'review_continuity',
        proof_required: ['fingerprint.json', 'lineage.json'],
        payload: { type, details, lane: process.env.LANE_NAME }
      });
    } catch (e) {
      console.error('[Continuity] Could not emit incident:', e.message);
    }
  }
}

module.exports = { ContinuityVerifier };
