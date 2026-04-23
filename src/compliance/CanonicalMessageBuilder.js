/**
 * SwarmMind CanonicalMessageBuilder
 * Wraps the global canonical builder for local use
 */
const path = require('path');
const { CanonicalMessageBuilder: GlobalBuilder } = require('S:/SwarmMind/.global/canonical-message-builder.js');

class SwarmMindBuilder extends GlobalBuilder {
  constructor(laneId = 'swarmmind') {
    super(laneId);
  }

  /**
   * Build a SwarmMind-compliant message
   * @param {Object} options - builder options
   * @returns {Object} v1.3 canonical message
   */
  build(options) {
    return this.buildMessage(options);
  }

  /**
   * Send message to target lane outbox
   * @param {string} toLane - target lane
   * @param {Object} message - built message
   * @param {string} filename - outbox filename
   */
  sendToLane(toLane, message, filename) {
    const fs = require('fs');
    const targetDir = `S:/SwarmMind/lanes/${toLane}/outbox`;
    if (!fs.existsSync(targetDir)) {
      // Support cross-lane delivery paths
      const altPaths = [
        `S:/Archivist-Agent/lanes/${toLane}/outbox`,
        `S:/self-organizing-library/lanes/${toLane}/outbox`,
        `S:/kernel-lane/lanes/${toLane}/outbox`
      ];
      for (const p of altPaths) {
        if (fs.existsSync(p)) {
          fs.writeFileSync(`${p}/${filename}`, JSON.stringify(message, null, 2));
          return { success: true, path: `${p}/${filename}` };
        }
      }
      throw new Error(`Cannot find outbox for ${toLane}`);
    }
    fs.writeFileSync(`${targetDir}/${filename}`, JSON.stringify(message, null, 2));
    return { success: true, path: `${targetDir}/${filename}` };
  }
}

module.exports = { CanonicalMessageBuilder: SwarmMindBuilder };
