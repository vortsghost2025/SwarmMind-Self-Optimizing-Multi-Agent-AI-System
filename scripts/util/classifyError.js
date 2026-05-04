'use strict';

const { ConstitutionViolation } = require('../constraint-lattice');

function classifyError(err) {
  const out = {
    error_domain: 'execution',
    retryable: false,
    scope: 'local_agent',
    risk_level: 'medium',
    containment_required: true,
    error_type: 'UNKNOWN',
  };

  const status = err && err.response && err.response.status;

  if (status) {
    if (status === 429 || status >= 500) {
      out.retryable = true;
      out.containment_required = false;
      out.error_type = `HTTP_${status}`;
      return out;
    }
    if (status >= 400) {
      out.error_domain = 'contract';
      out.error_type = `HTTP_${status}`;
      return out;
    }
  }

  if (err && (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT')) {
    out.retryable = true;
    out.containment_required = false;
    out.error_type = err.code;
    return out;
  }

  if (err instanceof ConstitutionViolation || (err && err.name === 'ConstitutionViolation')) {
    return {
      error_domain: 'constitution',
      retryable: false,
      scope: 'global_run',
      risk_level: 'high',
      containment_required: true,
      error_type: 'CONSTITUTION_VIOLATION',
    };
  }

  const msg = String((err && err.message) || err || '').toLowerCase();
  if (msg.includes('integrity') || msg.includes('hash') || msg.includes('checksum') || msg.includes('tamper')) {
    return {
      error_domain: 'integrity',
      retryable: false,
      scope: 'global_run',
      risk_level: 'high',
      containment_required: true,
      error_type: 'INTEGRITY_VIOLATION',
    };
  }

  if (msg.includes('timeout') || msg.includes('performance') || msg.includes('slow')) {
    out.error_domain = 'performance';
    out.retryable = true;
    out.error_type = 'PERFORMANCE_THRESHOLD';
    return out;
  }

  return out;
}

module.exports = { classifyError };
