'use strict';

const path = require('path');
const { ConstraintEngine, ConstitutionViolation } = require('./constraint-lattice');
const { classifyError } = require('./util/classifyError');
const { decide } = require('./util/decide');

const DOMAIN_STRATEGY_ORDER = ['RETRY', 'DEGRADE', 'QUARANTINE', 'ABORT'];

function isNonRetriableValidationError(err) {
  const msg = String(
    (err && (err.message || err.stderr || err.stack)) || err || ''
  ).toLowerCase();
  return msg.includes('invalid_type') && msg.includes('received') && msg.includes('nan');
}

function domainForError(err) {
  const cls = classifyError(err);
  return cls.error_domain;
}

async function retryWithPolicy(fn, opts = {}) {
  const engine = opts.constraintEngine || null;
  const domain = opts.domain || null;
  const strategy = (engine && domain) ? engine.getDomainStrategy(domain) : null;

  if (strategy === 'ABORT') {
    try { return await fn(); } catch (err) { throw err; }
  }

  if (strategy === 'QUARANTINE') {
    try { return await fn(); } catch (err) {
      err.quarantined = true;
      err.quarantine_domain = domain;
      throw err;
    }
  }

  const policyRetry = engine ? engine.getRetryConfig() : null;
  const retries = opts.retries != null ? opts.retries : (policyRetry ? policyRetry.max_attempts - 1 : 3);
  const minDelay = opts.minDelay != null ? opts.minDelay : (policyRetry ? policyRetry.base_delay_ms : 100);
  const maxDelay = opts.maxDelay != null ? opts.maxDelay : (policyRetry ? policyRetry.max_delay_ms : 10000);
  const jitter = policyRetry ? (policyRetry.jitter || 0) : 0;
  const shouldRetry = typeof opts.shouldRetry === 'function'
    ? opts.shouldRetry
    : (err) => {
        if (strategy === 'DEGRADE') return true;
        const d = domainForError(err);
        const s = engine ? engine.getDomainStrategy(d) : 'RETRY';
        return s === 'RETRY' || s === 'DEGRADE';
      };

  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!shouldRetry(err, i, retries)) {
        throw err;
      }
      if (i === retries) break;
      let delay = Math.min(minDelay * Math.pow(2, i), maxDelay);
      if (jitter > 0) delay = delay * (1 + (Math.random() * 2 - 1) * jitter);
      if (opts.onRetry) opts.onRetry(err, i, delay);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function retry(fn, opts = {}) {
  if (opts.constraintEngine || opts.domain) return retryWithPolicy(fn, opts);
  const retries = opts.retries || 3;
  const minDelay = opts.minDelay || 100;
  const maxDelay = opts.maxDelay || 10000;
  const shouldRetry = typeof opts.shouldRetry === 'function'
    ? opts.shouldRetry
    : (err) => !isNonRetriableValidationError(err);
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!shouldRetry(err, i, retries)) {
        throw err;
      }
      if (i === retries) break;
      const delay = Math.min(minDelay * Math.pow(2, i), maxDelay);
      if (opts.onRetry) opts.onRetry(err, i, delay);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

module.exports = { retry, retryWithPolicy, domainForError, DOMAIN_STRATEGY_ORDER };
