'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_POLICY_PATH = path.join(__dirname, '..', 'config', 'resilience-policy.json');

class ConstitutionViolation extends Error {
  constructor(constraintId, stage, severity, detail) {
    super(`Constitution violation: [${stage}] ${constraintId} (${severity}) — ${detail}`);
    this.name = 'ConstitutionViolation';
    this.constraintId = constraintId;
    this.stage = stage;
    this.severity = severity;
    this.detail = detail;
  }
}

const CONSTRAINT_EVALUATORS = {
  allowlist_tool(ctx, config) {
    const tool = ctx.tool || ctx.action || null;
    if (!tool) return { pass: true, reason: 'no tool specified' };
    const allowed = new Set(config.allowed_tools || []);
    if (allowed.has(tool)) return { pass: true, reason: `${tool} in allowlist` };
    return { pass: false, reason: `${tool} not in allowlist`, violating_tool: tool };
  },

  budget_toolcalls(ctx, config) {
    const used = ctx.tool_call_count != null ? ctx.tool_call_count : (ctx.tool_calls ? ctx.tool_calls.length : 0);
    const max = config.max != null ? config.max : Infinity;
    if (used <= max) return { pass: true, reason: `${used}/${max} tool calls`, used, max };
    return { pass: false, reason: `${used} exceeds ${max} tool calls`, used, max };
  },

  schema_presence(ctx, config) {
    const required = config.required_fields || [];
    const missing = required.filter(f => ctx[f] === undefined && (!ctx.response || ctx.response[f] === undefined));
    if (missing.length === 0) return { pass: true, reason: 'all required fields present', required };
    return { pass: false, reason: `missing: ${missing.join(', ')}`, missing, required };
  },

  label_degraded_if_used(ctx, config) {
    const degraded = ctx.degraded === true || (ctx.strategy_used && ctx.strategy_used !== 'PRIMARY');
    if (!degraded) return { pass: true, reason: 'no degradation detected' };
    return { pass: true, reason: 'degradation labeled', degraded: true, requires_label: true };
  },
};

class ConstraintEngine {
  constructor(options = {}) {
    this.policyPath = options.policyPath || DEFAULT_POLICY_PATH;
    this.policy = null;
    this.constraintSet = null;
    this._loaded = false;
  }

  load() {
    try {
      const raw = fs.readFileSync(this.policyPath, 'utf8');
      this.policy = JSON.parse(raw);
      this.constraintSet = this.policy.constraints || null;
      this._loaded = true;
    } catch (err) {
      throw new Error(`ConstraintEngine: failed to load policy from ${this.policyPath}: ${err.message}`);
    }
    return this;
  }

  ensureLoaded() {
    if (!this._loaded) this.load();
  }

  evaluateStage(stage, ctx) {
    this.ensureLoaded();
    if (!this.constraintSet) return { stage, results: [], all_pass: true, violations: [] };

    const constraints = this.constraintSet[stage];
    if (!Array.isArray(constraints)) return { stage, results: [], all_pass: true, violations: [] };

    const results = [];
    const violations = [];

    for (const constraint of constraints) {
      const evaluator = CONSTRAINT_EVALUATORS[constraint.type];
      if (!evaluator) {
        results.push({
          constraint_id: constraint.id,
          type: constraint.type,
          stage,
          severity: constraint.severity || 'medium',
          pass: false,
          reason: `unknown constraint type: ${constraint.type}`,
        });
        violations.push(results[results.length - 1]);
        continue;
      }

      const result = evaluator(ctx, constraint.config || {});
      const entry = {
        constraint_id: constraint.id,
        type: constraint.type,
        stage,
        severity: constraint.severity || 'medium',
        pass: result.pass,
        reason: result.reason,
      };
      if (result.violating_tool) entry.violating_tool = result.violating_tool;
      if (result.used != null) entry.used = result.used;
      if (result.max != null) entry.max = result.max;
      if (result.missing) entry.missing = result.missing;
      if (result.degraded) entry.degraded = result.degraded;

      results.push(entry);
      if (!result.pass) violations.push(entry);
    }

    return { stage, results, all_pass: violations.length === 0, violations };
  }

  enforce(stage, ctx) {
    const evalResult = this.evaluateStage(stage, ctx);
    if (!evalResult.all_pass) {
      const v = evalResult.violations[0];
      throw new ConstitutionViolation(v.constraint_id, stage, v.severity, v.reason);
    }
    return evalResult;
  }

  evaluateAll(ctx) {
    const stages = ['pre_action', 'post_action', 'pre_output'];
    const all = {};
    let anyViolation = false;

    for (const stage of stages) {
      all[stage] = this.evaluateStage(stage, ctx);
      if (!all[stage].all_pass) anyViolation = true;
    }

    return {
      all_pass: !anyViolation,
      stages: all,
      constraint_set_id: this.constraintSet ? this.constraintSet.set_id : null,
    };
  }

  getDomainStrategy(domain) {
    this.ensureLoaded();
    if (!this.policy || !this.policy.domains) return null;
    const d = this.policy.domains[domain];
    return d ? d.default_strategy : null;
  }

  getRetryConfig() {
    this.ensureLoaded();
    return this.policy ? (this.policy.retry || null) : null;
  }

  getBudgets() {
    this.ensureLoaded();
    return this.policy ? (this.policy.budgets || null) : null;
  }
}

module.exports = { ConstraintEngine, ConstitutionViolation, CONSTRAINT_EVALUATORS };
