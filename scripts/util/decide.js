'use strict';

function decide(classification, policy, ctx) {
  if (classification.error_domain === 'constitution') {
    return { strategy: 'ABORT', reason: 'constitution_violation' };
  }

  if (classification.error_domain === 'integrity') {
    return { strategy: 'QUARANTINE', reason: 'integrity_risk' };
  }

  if (classification.error_domain === 'contract') {
    return { strategy: 'QUARANTINE', reason: 'contract_failure' };
  }

  if (classification.error_domain === 'performance') {
    return ctx && ctx.degrade_allowed
      ? { strategy: 'DEGRADE', reason: 'performance_threshold' }
      : { strategy: 'ABORT', reason: 'performance_no_degrade' };
  }

  if (classification.retryable) {
    if (ctx && !ctx.idempotent) {
      return { strategy: 'QUARANTINE', reason: 'not_idempotent' };
    }

    if (ctx && ctx.breaker_open) {
      return { strategy: 'DEGRADE', reason: 'breaker_open' };
    }

    const maxAttempts = (policy && policy.retry) ? policy.retry.max_attempts : 5;
    const attemptsUsed = (ctx && ctx.attempts_used) || 0;
    if (attemptsUsed >= maxAttempts) {
      return { strategy: 'QUARANTINE', reason: 'retry_exhausted' };
    }

    return { strategy: 'RETRY', reason: 'transient_execution' };
  }

  return { strategy: 'QUARANTINE', reason: 'default_safe' };
}

module.exports = { decide };
