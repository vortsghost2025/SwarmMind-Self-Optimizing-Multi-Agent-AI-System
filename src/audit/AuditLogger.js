/**
 * Audit Layer – records all queue state transitions and produces audit reports
 * 
 * This module provides:
 * - Immutable append‑only audit log (JSON‑lines)
 * - Helper to record events (enqueue, status change)
 * - Report generation (by queue type, by lane, by time range)
 */

const fs = require('fs');
const path = require('path');

class AuditLogger {
  static _signer = null;
  static _keyManager = null;

  static setAttestation(signer, keyManager) {
    AuditLogger._signer = signer;
    AuditLogger._keyManager = keyManager;
  }

  /**
   * @param {string} logDir - Directory where audit logs are stored
   */
  constructor(logDir = path.resolve(__dirname, '../../audit')) {
    this.logDir = logDir;
    this.filePath = path.join(this.logDir, 'audit.log');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '', { flag: 'wx' });
    }
  }

  /**
   * Write an audit entry
   * @param {object} event - Event object with type, lane, queue_item_id, details
   */
  record(event) {
    const entry = {
      timestamp: new Date().toISOString(),
      event_type: event.type,
      originating_lane: process.env.LANE_NAME || 'unknown',
      lane: process.env.LANE_NAME || 'unknown',
      queue_item_id: event.itemId || null,
      queue_type: event.queueType || null,
      details: event.details || {},
      metadata: event.metadata || {}
    };

    if (AuditLogger._signer && AuditLogger._keyManager) {
      const passphrase = process.env.LANE_KEY_PASSPHRASE;
      if (passphrase) {
        try {
          const privateKey = AuditLogger._keyManager.loadPrivateKey(passphrase);
          const publicKeyInfo = AuditLogger._keyManager.getPublicKeyInfo();
          if (privateKey && publicKeyInfo) {
            const signed = AuditLogger._signer.signAuditEvent(entry, privateKey, publicKeyInfo.key_id);
            Object.assign(entry, signed);
          }
        } catch (e) {
          console.error('[AuditLogger] Failed to sign entry:', e.message);
        }
      }
    }

    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.filePath, line, { encoding: 'utf8' });
  }

  /**
   * Load all audit entries
   */
  loadAll() {
    const raw = fs.readFileSync(this.filePath, { encoding: 'utf8' });
    if (!raw) return [];
    return raw.trim().split('\n').map(l => JSON.parse(l));
  }

  /**
   * Generate summary report by queue type
   * @returns {object} Map of queue_type -> counts of events
   */
  generateQueueSummary() {
    const all = this.loadAll();
    const summary = {};
    for (const entry of all) {
      const qt = entry.queue_type || 'global';
      if (!summary[qt]) summary[qt] = { total: 0, enqueued: 0, status_changed: 0 };
      summary[qt].total++;
      if (entry.event_type === 'enqueue') summary[qt].enqueued++;
      if (entry.event_type === 'status_change') summary[qt].status_changed++;
    }
    return summary;
  }

  /**
   * Generate timeline of all events for a specific queue item
   * @param {string} itemId - Queue item ID to trace
   * @returns {array} Chronological list of events
   */
  traceItem(itemId) {
    const all = this.loadAll();
    return all.filter(e => e.queue_item_id === itemId).sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    );
  }

  /**
   * Export audit log to a human‑readable report file
   * @param {string} outPath - Where to write the report
   */
  exportReport(outPath) {
    const all = this.loadAll();
    const lines = [
      `# Audit Report - Generated ${new Date().toISOString()}`,
      `Total events: ${all.length}`,
      '',
      `## Event List`,
      ``,
      `| Timestamp | Event Type | Lane | Queue Type | Item ID | Details |`,
      `|-----------|------------|------|------------|---------|---------|`
    ];
    for (const e of all) {
      const details = JSON.stringify(e.details).replace(/\|/g, '\\|');
      lines.push(`| ${e.timestamp} | ${e.event_type} | ${e.originating_lane} | ${e.queue_type || '-'} | ${e.queue_item_id || '-'} | ${details} |`);
    }
    fs.writeFileSync(outPath, lines.join('\n'), { encoding: 'utf8' });
  }
}

// Auto‑install: create a global audit instance
const audit = new AuditLogger();

// Hook into Queue module if available (will be required after this file)
function attachQueueHooks() {
  try {
    const Queue = require('../queue/Queue');
    // Monkey‑patch Queue.prototype to auto‑log events
    const origEnqueue = Queue.prototype.enqueue;
    Queue.prototype.enqueue = function(item) {
      const result = origEnqueue.call(this, item);
      audit.record({
        type: 'enqueue',
        queueType: this.type,
        itemId: result.id,
        details: { artifact: item.artifact_path, action: item.required_action }
      });
      return result;
    };
    const origUpdateStatus = Queue.prototype.updateStatus;
    Queue.prototype.updateStatus = function(id, newStatus, resolution) {
      const result = origUpdateStatus.call(this, id, newStatus, resolution);
      audit.record({
        type: 'status_change',
        queueType: this.type,
        itemId: id,
        details: { newStatus, resolution }
      });
      return result;
    };
    console.log('[AUDIT] Queue hooks attached — all enqueue/status changes logged');
  } catch (e) {
    // Queue not loaded yet; hooks will be attached later when required
  }
}

// Attach immediately; if Queue not yet loaded, it'll be required later and we can re‑attach
attachQueueHooks();

module.exports = {
  AuditLogger,
  audit: audit
};
