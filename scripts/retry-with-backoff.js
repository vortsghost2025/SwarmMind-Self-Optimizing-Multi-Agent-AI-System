/**
 * Retry a function with exponential backoff.
 * @param {Function} fn - async function to retry
 * @param {Object} opts - { retries, minDelay, maxDelay, onRetry }
 */
async function retry(fn, opts = {}) {
  const retries = opts.retries || 3;
  const minDelay = opts.minDelay || 100;
  const maxDelay = opts.maxDelay || 10000;
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === retries) break;
      const delay = Math.min(minDelay * Math.pow(2, i), maxDelay);
      if (opts.onRetry) opts.onRetry(err, i, delay);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

module.exports = { retry };
