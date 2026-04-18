/**
 * Queue subsystem – simple append‑only JSON‑line log.
 * Provides enqueue, getPending, and status transition validation.
 */

const fs = require('fs');
const path = require('path');

class Queue {
  /**
   * @param {string} type - Queue type (e.g., 'COMMAND', 'REVIEW').
   * @param {string} [baseDir] - Base directory for queue storage.
   */
  constructor(type, baseDir = path.resolve(__dirname, '../../queue')) {
    this.type = type.toUpperCase();
    this.baseDir = baseDir;
    this.filePath = path.join(this.baseDir, `${this.type.toLowerCase()}.log`);
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '', { flag: 'wx' });
    }
    this._lastId = 0;
  }

  _generateId() {
    const now = Date.now();
    this._lastId = (this._lastId + 1) % 10000;
    return `Q-${now}-${this._lastId}`;
  }

  _appendLine(obj) {
    const line = JSON.stringify(obj) + '\n';
    fs.appendFileSync(this.filePath, line, { encoding: 'utf8' });
  }

  enqueue(item) {
    const now = new Date().toISOString();
    const entry = {
      id: this._generateId(),
      timestamp: now,
      origin_lane: process.env.LANE_NAME || 'unknown',
      target_lane: item.target_lane,
      type: item.type,
      artifact_path: item.artifact_path || null,
      required_action: item.required_action || null,
      proof_required: item.proof_required || [],
      status: 'pending',
      resolution: null,
      payload: item.payload || null,
    };
    this._appendLine(entry);
    return entry;
  }

  _loadAll() {
    const raw = fs.readFileSync(this.filePath, { encoding: 'utf8' });
    if (!raw) return [];
    return raw.trim().split('\n').map(l => JSON.parse(l));
  }

  getPending() {
    const all = this._loadAll();
    return all.filter(i => i.status === 'pending');
  }

  updateStatus(id, newStatus, resolution = null) {
    const allowed = ['pending', 'accepted', 'rejected', 'superseded'];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Invalid status ${newStatus}`);
    }
    const all = this._loadAll();
    const idx = all.findIndex(i => i.id === id);
    if (idx === -1) {
      throw new Error(`Queue item ${id} not found`);
    }
    const current = all[idx];
    if (current.status !== 'pending') {
      throw new Error(`Only pending items can be transitioned (current: ${current.status})`);
    }
    all[idx].status = newStatus;
    if (resolution) all[idx].resolution = resolution;
    const tempPath = this.filePath + '.tmp';
    const data = all.map(o => JSON.stringify(o)).join('\n') + '\n';
    fs.writeFileSync(tempPath, data, { encoding: 'utf8' });
    fs.renameSync(tempPath, this.filePath);
    return all[idx];
  }
}

module.exports = Queue;
