/**
 * Identity Attestation Stub
 * 
 * Provides lane identity and cryptographic signature stubs for queue items.
 * Future: replace with real asymmetric key pairs per lane and signed JWT tokens.
 */

const crypto = require('crypto');

class IdentityManager {
  constructor() {
    // Load lane identity from environment; default to unknown
    this.laneId = process.env.LANE_NAME || 'unknown';
    this.laneKey = this._loadLaneKey();
  }

  /**
   * Load a lane-specific signing key (stub: read from env or generate ephemeral)
   */
  _loadLaneKey() {
    const keyEnv = process.env.LANE_SIGNING_KEY;
    if (keyEnv) return keyEnv;
    // Ephemeral key for this process (not persistent across restarts)
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Sign a queue item payload (stub: HMAC-SHA256)
   * @param {object} item - Queue item to sign
   * @returns {string} Hex-encoded signature
   */
  sign(item) {
    const signable = JSON.stringify({
      id: item.id,
      timestamp: item.timestamp,
      origin_lane: item.origin_lane,
      type: item.type,
      artifact_path: item.artifact_path,
      required_action: item.required_action,
      payload: item.payload
    });
    const hmac = crypto.createHmac('sha256', this.laneKey);
    hmac.update(signable);
    return hmac.digest('hex');
  }

  /**
   * Verify a queue item's signature (stub: constant-time compare)
   * @param {object} item - Queue item with attached signature
   * @param {string} signature - Signature to verify
   * @returns {boolean} true if valid
   */
  verify(item, signature) {
    const expected = this.sign(item);
    // Use timing-safe compare
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  }

  /**
   * Get current lane identity
   */
  getLaneId() {
    return this.laneId;
  }
}

// Global singleton
const identity = new IdentityManager();

/**
 * Attach identity and signature to a queue item before enqueue
 * Call this from Queue.enqueue if identity module is present
 */
function signQueueItem(item) {
  // item already has id, timestamp, etc.
  const signature = identity.sign(item);
  return { ...item, signature };
}

/**
 * Verify a queued item's signature
 */
function verifyQueueItem(item) {
  if (!item.signature) {
    return { valid: false, reason: 'missing_signature' };
  }
  const ok = identity.verify(item, item.signature);
  return { valid: ok, reason: ok ? null : 'invalid_signature' };
}

module.exports = {
  IdentityManager,
  identity,
  signQueueItem,
  verifyQueueItem
};
