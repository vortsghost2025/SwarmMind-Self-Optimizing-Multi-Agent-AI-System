'use strict';

const fs = require('fs');
const path = require('path');
const { ConstraintEngine } = require('./constraint-lattice');
const { evaluateVerificationDomain } = require('./verification-domain-gate');
const { driftScore, verifyTraceIntegrity } = require('./swarmmind-verify');
const { ArtifactResolver } = require('./artifact-resolver');
const { getCodeVersionHash } = require('./code-version-hash');

class LaneL {
  constructor(options = {}) {
    this.engine = null;
    try {
      const policyPath = options.policyPath || path.join(__dirname, '..', 'config', 'resilience-policy.json');
      if (fs.existsSync(policyPath)) {
        this.engine = new ConstraintEngine({ policyPath });
        this.engine.load();
      }
    } catch (_) {}
  }

  verify(msg) {
    const evidence = [];
    const concerns = [];
    let result = 'PASS';
    let confidence = 8;

    if (!msg || typeof msg !== 'object') {
      result = 'FAIL';
      confidence = 1;
      evidence.push({ source: 'dual-verification.js', issue: 'message is not a valid object' });
      return { result, confidence, evidence, concerns, lane: 'L', perspective: 'structural' };
    }

    if (this.engine) {
      const all = this.engine.evaluateAll(msg);
      if (!all.all_pass) {
        result = 'FAIL';
        confidence = 3;
      }
      for (const [stage, evalResult] of Object.entries(all.stages || {})) {
        if (evalResult.violations && evalResult.violations.length > 0) {
          for (const v of evalResult.violations) {
            evidence.push({ source: 'constraint-lattice.js', constraint_id: v.constraint_id, stage, severity: v.severity });
          }
        }
      }
      if (all.constraint_set_id) {
        evidence.push({ source: 'config/resilience-policy.json', constraint_set: all.constraint_set_id });
      }
    } else {
      concerns.push('ConstraintEngine not available — structural verification skipped');
      confidence = 4;
    }

    if (!msg || typeof msg !== 'object') {
      result = 'FAIL';
      confidence = 1;
      evidence.push({ source: 'dual-verification.js', issue: 'message is not a valid object' });
    }

    return { result, confidence, evidence, concerns, lane: 'L', perspective: 'structural' };
  }
}

class LaneR {
  constructor(options = {}) {
    this.repoRoot = options.repoRoot || path.resolve(__dirname, '..');
    this.resolver = options.resolver || new ArtifactResolver({ dryRun: true, configPath: path.join(this.repoRoot, 'config', 'allowed_roots.json') });
    this.codeVersionHash = options.codeVersionHash || getCodeVersionHash(this.repoRoot);
  }

  verify(msg, trace) {
    const evidence = [];
    const concerns = [];
    let result = 'PASS';
    let confidence = 7;

    if (!msg || typeof msg !== 'object') {
      result = 'FAIL';
      confidence = 1;
      evidence.push({ source: 'dual-verification.js', issue: 'message is not a valid object' });
      return { result, confidence, evidence, concerns, lane: 'R', perspective: 'operational' };
    }

    const hasProof = (msg.evidence_exchange && msg.evidence_exchange.artifact_path) ||
      msg.completion_artifact_path ||
      (msg.evidence && msg.evidence.required === true && msg.evidence.evidence_path);

    if (hasProof) {
      const domain = evaluateVerificationDomain(msg, {
        resolver: this.resolver,
        localCodeVersionHash: this.codeVersionHash,
        repoRoot: this.repoRoot,
      });
      if (!domain.domain_valid) {
        result = 'FAIL';
        confidence = 3;
      }
      evidence.push({ source: 'verification-domain-gate.js', phase: domain.phase, valid: domain.domain_valid, reason: domain.invalid_domain_reason });
    } else {
      evidence.push({ source: 'dual-verification.js', note: 'no completion proof — domain gate not applicable' });
    }

    if (trace && typeof trace === 'object') {
      const integrity = verifyTraceIntegrity(trace);
      if (!integrity.valid) {
        concerns.push(`Trace integrity issues: ${integrity.issues.join(', ')}`);
        confidence = Math.max(confidence - 2, 1);
      }
      evidence.push({ source: 'swarmmind-verify.js', trace_integrity: integrity.valid });

      const drift = driftScore(trace);
      evidence.push({ source: 'swarmmind-verify.js', drift_score: drift.score, interpretation: drift.interpretation });
      if (drift.interpretation === 'critical_drift') {
        concerns.push('Critical drift detected in trace');
        confidence = Math.max(confidence - 3, 1);
      } else if (drift.interpretation === 'significant_drift') {
        concerns.push('Significant drift in trace');
        confidence = Math.max(confidence - 1, 1);
      }
    } else {
      concerns.push('No trace provided — operational drift check skipped');
      confidence = Math.max(confidence - 1, 1);
    }

    return { result, confidence, evidence, concerns, lane: 'R', perspective: 'operational' };
  }
}

function consensusCheck(laneL, laneR, options = {}) {
  const maxConfidenceDelta = options.maxConfidenceDelta || 3;
  const minConsensusConfidence = options.minConsensusConfidence || 7;

  const agree = laneL.result === laneR.result;
  const confidenceDelta = Math.abs(laneL.confidence - laneR.confidence);
  const confidenceOk = confidenceDelta <= maxConfidenceDelta;
  const consensusConfidence = (laneL.confidence + laneR.confidence) / 2;
  const aboveThreshold = consensusConfidence >= minConsensusConfidence;

  let action;
  if (laneL.result === 'FAIL' && laneR.result === 'FAIL') {
    action = 'ESCALATE';
  } else if (!agree) {
    action = 'INVESTIGATE';
  } else if (agree && confidenceOk && aboveThreshold) {
    action = 'PROCEED';
  } else if (agree && !aboveThreshold) {
    action = 'ADDITIONAL_VERIFICATION';
  } else {
    action = 'INVESTIGATE';
  }

  return {
    lane_l: laneL,
    lane_r: laneR,
    agree,
    confidence_delta: confidenceDelta,
    confidence_ok: confidenceOk,
    consensus_confidence: consensusConfidence,
    above_threshold: aboveThreshold,
    action,
  };
}

class DualVerification {
  constructor(options = {}) {
    this.laneL = new LaneL(options);
    this.laneR = new LaneR(options);
    this.maxConfidenceDelta = options.maxConfidenceDelta || 3;
    this.minConsensusConfidence = options.minConsensusConfidence || 7;
  }

  verify(msg, trace) {
    const lResult = this.laneL.verify(msg);
    const rResult = this.laneR.verify(msg, trace);
    const consensus = consensusCheck(lResult, rResult, {
      maxConfidenceDelta: this.maxConfidenceDelta,
      minConsensusConfidence: this.minConsensusConfidence,
    });
    return consensus;
  }
}

module.exports = { DualVerification, LaneL, LaneR, consensusCheck };
