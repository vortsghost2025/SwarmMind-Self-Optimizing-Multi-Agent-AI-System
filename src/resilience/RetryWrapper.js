/**
 * Resilience: Timeout + Retry Wrapper
 *
 * Provides a configurable retry mechanism with:
 * - Per-attempt timeout
 * - Exponential backoff with jitter
 * - Audit logging of retry events
 * - Respect for lane context (no cross-lane writes during backoff)
 *
 * Usage:
 *   const retry = new RetryWrapper({ maxAttempts: 3, initialDelayMs: 100, timeoutMs: 5000 });
 *   const result = await retry.execute(async () => {
 *     return await someUnstableOperation();
 *   }, { operation: 'http_get', target: 'api.example.com' });
 */

const { AuditLogger, audit } = require('../audit/AuditLogger');

class RetryWrapper {
   /**
    * @param {object} config
    * @param {number} config.maxAttempts - Maximum retry attempts (default 3)
    * @param {number} config.initialDelayMs - Initial backoff delay in ms (default 100)
    * @param {number} config.maxDelayMs - Maximum backoff delay (default 30000)
    * @param {number} config.timeoutMs - Per-attempt timeout in ms (default 5000)
    * @param {boolean} config.enableJitter - Add random jitter to backoff (default true)
    * @param {function} config.shouldRetry - Custom predicate (error) => boolean
    * @param {function} config.onRetry - Callback(attempt, error, delayMs)
    * @param {RecoveryClassifier} config.recoveryClassifier - Optional classifier to invoke on exhaustion
    */
   constructor(config = {}) {
     this.maxAttempts = config.maxAttempts || 3;
     this.initialDelayMs = config.initialDelayMs || 100;
     this.maxDelayMs = config.maxDelayMs || 30000;
     this.timeoutMs = config.timeoutMs || 5000;
     this.enableJitter = config.enableJitter !== false;
     this.shouldRetry = config.shouldRetry || this._defaultRetryPredicate;
     this.onRetry = config.onRetry || null;
     this.recoveryClassifier = config.recoveryClassifier || null;
     this.auditEnabled = config.audit !== false;
   }

  /**
   * Default retry predicate: retry on network/timeout errors, not on programmer errors
   */
  /**
   * Default retry predicate: retry on transient failures (network, timeout, rate limit, server errors)
   * Do NOT retry on programmer errors (TypeError, ReferenceError, SyntaxError, RangeError, URIError) or explicit retryable=false
   */
  _defaultRetryPredicate(error) {
    // Explicit non-retryable flag
    if (error.retryable === false) return false;

    // Programmer errors (synchronous exception types) - do not retry
    const programmerErrorTypes = ['RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError'];
    if (programmerErrorTypes.some(type => error instanceof globalThis[type])) return false;

    // Network/timeout errors by code
    const retryableCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'];
    if (error.code && retryableCodes.includes(error.code)) return true;

    // HTTP status codes
    if (error.status === 429 || (error.status >= 500 && error.status < 600)) return true;

    // Message heuristics
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('timeout') || msg.includes('network') || msg.includes('rate limit') || msg.includes('too many requests')) return true;

    // Default: retry (be conservative for transient unknowns)
    return true;
  }

  /**
   * Calculate backoff delay with exponential growth and optional jitter
   */
  _calculateDelay(attempt) {
    // Exponential: initialDelay * 2^(attempt - 1)
    let delay = this.initialDelayMs * Math.pow(2, attempt - 1);
    // Cap at maxDelay
    delay = Math.min(delay, this.maxDelayMs);
    // Add jitter: ±25% random
    if (this.enableJitter) {
      const jitter = delay * 0.25;
      delay = delay - jitter + Math.random() * 2 * jitter;
    }
    return Math.floor(delay);
  }

  /**
   * Wrap a function with timeout using Promise.race
   */
  _withTimeout(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => {
          const err = new Error(`Operation timeout after ${timeoutMs}ms`);
          err.code = 'ETIMEDOUT';
          reject(err);
        }, timeoutMs);
      })
    ]);
  }

  /**
   * Execute an async function with retry logic
   *
   * @param {function} fn - Async function to execute
   * @param {object} metadata - Context for audit logging (operation, target, etc.)
   * @returns {Promise<any>} - Result of fn on success
   * @throws {Error} - If all attempts fail
   */
  async execute(fn, metadata = {}) {
    const { operation = 'unknown', target = null } = metadata;

    let lastError;
    let attempt = 1;

    while (attempt <= this.maxAttempts) {
      try {
        // Wrap with timeout
        const result = await this._withTimeout(fn(), this.timeoutMs);

        // Success - audit if enabled
        if (this.auditEnabled && attempt > 1) {
          audit.record({
            type: 'retry_success',
            queueType: null,
            itemId: null,
            details: {
              operation,
              target,
              attempts: attempt,
              totalDelayMs: this._calculateDelay(attempt - 1) * (attempt - 1)
            }
          });
        }

        return result;
      } catch (error) {
        lastError = error;

        // Check if we should retry
        const canRetry = attempt < this.maxAttempts && this.shouldRetry(error);

        if (!canRetry) {
          // Final failure - audit
          if (this.auditEnabled) {
            audit.record({
              type: 'retry_exhausted',
              queueType: null,
              itemId: null,
              details: {
                operation,
                target,
                attempts: attempt,
                finalError: error.message,
                errorCode: error.code
              }
            });
          }

           // Invoke recovery classifier if configured
           if (this.recoveryClassifier && typeof this.recoveryClassifier.classify === 'function') {
             try {
               this.recoveryClassifier.classify({
                 operation,
                 target,
                 finalError: error,
                 attempts: attempt,
                 totalDelayMs: this._calculateDelay(attempt - 1) * (attempt - 1)
               });
             } catch (rcErr) {
               console.error('[RetryWrapper] RecoveryClassifier failed:', rcErr.message);
             }
           }

          throw error;
        }

        // Calculate backoff
        const delayMs = this._calculateDelay(attempt);

        // Audit retry event
        if (this.auditEnabled) {
          audit.record({
            type: 'retry_backoff',
            queueType: null,
            itemId: null,
            details: {
              operation,
              target,
              attempt,
              delayMs,
              errorCode: error.code,
              errorMessage: error.message
            }
          });
        }

        // Invoke callback if provided
        if (this.onRetry) {
          this.onRetry(attempt, error, delayMs);
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delayMs));
        attempt++;
      }
    }

    // Should not reach here, but safety net
    throw lastError;
  }

  /**
   * Convenience method to retry a function that might reject or timeout
   * Shortcut for execute with default metadata
   */
  async retry(fn) {
    return this.execute(fn, { operation: 'anonymous' });
  }
}

module.exports = { RetryWrapper };
