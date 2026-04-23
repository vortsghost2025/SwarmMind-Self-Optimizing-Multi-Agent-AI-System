/**
 * Retry Helpers – pre‑configured wrappers for common operations
 *
 * These are convenience functions that apply the RetryWrapper with sensible defaults
 * for specific operation types. They integrate with the Audit layer automatically.
 */

const { RetryWrapper } = require('./RetryWrapper');

// Shared retry configurations per operation category
const CONFIG = {
  http: {
    maxAttempts: 3,
    initialDelayMs: 200,
    maxDelayMs: 10000,
    timeoutMs: 10000,
    enableJitter: true,
    shouldRetry: (err) => {
      // Retry on network errors, timeouts, rate limits, server errors
      if (err.code && ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'].includes(err.code)) return true;
      if (err.status === 429 || (err.status >= 500 && err.status < 600)) return true;
      if (err.message && (err.message.includes('timeout') || err.message.includes('network'))) return true;
      return false;
    }
  },
  file: {
    maxAttempts: 2,
    initialDelayMs: 50,
    maxDelayMs: 2000,
    timeoutMs: 3000,
    enableJitter: true,
    shouldRetry: (err) => {
      // Retry on transient file lock errors (EACCES, EPERM) and network FS errors
      if (err.code && ['EACCES', 'EPERM', 'EBUSY', 'ENOTEMPTY'].includes(err.code)) return true;
      return false;
    }
  },
  queue: {
    maxAttempts: 5,
    initialDelayMs: 100,
    maxDelayMs: 30000,
    timeoutMs: 5000,
    enableJitter: true,
    shouldRetry: (err) => true  // Queue operations are idempotent; retry liberally
  }
};

/**
 * Create a RetryWrapper instance for a given operation type
 * @param {string} type - 'http' | 'file' | 'queue'
 * @returns {RetryWrapper}
 */
function getRetryer(type) {
  const cfg = CONFIG[type];
  if (!cfg) throw new Error(`Unknown retry type: ${type}`);
  return new RetryWrapper(cfg);
}

/**
 * Execute an async function with retry (generic)
 * @param {function} fn - async function returning a promise
 * @param {object} meta - { operation, target }
 * @param {string} retryType - category of retry policy
 */
async function withRetry(fn, meta = {}, retryType = 'http') {
  const wrapper = getRetryer(retryType);
  return wrapper.execute(fn, meta);
}

/**
 * Specific: retry a file write operation (fs.promises.writeFile)
 * Useful for cross‑lane writes that may hit transient locks
 */
async function retryWriteFile(filePath, data, options) {
  const wrapper = getRetryer('file');
  return wrapper.execute(
    () => require('fs').promises.writeFile(filePath, data, options),
    { operation: 'fs_writeFile', target: filePath }
  );
}

/**
 * Specific: retry an HTTP fetch (node‑fetch or similar)
 * @param {string} url
 * @param {object} options
 */
async function retryFetch(url, options = {}) {
  const wrapper = getRetryer('http');
  return wrapper.execute(
    () => require('node-fetch').default(url, options),
    { operation: 'http_fetch', target: url }
  );
}

/**
 * Specific: retry a queue enqueue operation
 * @param {Queue} queueInstance
 * @param {object} item
 */
async function retryEnqueue(queueInstance, item) {
  const wrapper = getRetryer('queue');
  return wrapper.execute(
    () => queueInstance.enqueue(item),
    { operation: 'queue_enqueue', target: queueInstance.type }
  );
}

module.exports = {
  getRetryer,
  withRetry,
  retryWriteFile,
  retryFetch,
  retryEnqueue,
  CONFIG
};
