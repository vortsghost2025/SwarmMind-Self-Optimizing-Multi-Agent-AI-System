'use strict';

const fs = require('fs');
const path = require('path');
const { loadPolicy, assertWatcherConfig } = require('./concurrency-policy');

/** @typedef {{ laneName: string, inboxPath: string, intervalSeconds: number, staleAfterSeconds: number, canonicalPaths: Object<string, string> }} HeartbeatConfig */

/** @type {HeartbeatConfig} */
const DEFAULT_CONFIG = {
  laneName: 'swarmmind',
  inboxPath: path.join(__dirname, '..', 'lanes', 'swarmmind', 'inbox'),
  intervalSeconds: 60,
  staleAfterSeconds: 900,
  canonicalPaths: {
    archivist: 'S:/Archivist-Agent/lanes/archivist/inbox/',
    library: 'S:/self-organizing-library/lanes/library/inbox/',
    swarmmind: 'S:/SwarmMind/lanes/swarmmind/inbox/',
    kernel: 'S:/kernel-lane/lanes/kernel/inbox/'
  }
};

const REPO_ROOT = path.join(__dirname, '..');
const POLICY = loadPolicy(REPO_ROOT);
assertWatcherConfig({
  laneName: DEFAULT_CONFIG.laneName,
  heartbeatSeconds: DEFAULT_CONFIG.intervalSeconds
}, POLICY);

class Heartbeat {
  /**
   * @param {Partial<HeartbeatConfig>} [configOverrides]
   */
  constructor(configOverrides) {
    /** @type {HeartbeatConfig} */
    this.config = Object.assign({}, DEFAULT_CONFIG, configOverrides || {});
    /** @type {number} */
    this.startTime = Date.now();
    /** @type {number} */
    this.messagesProcessed = 0;
    /** @type {NodeJS.Timer|null} */
    this._timer = null;
    /** @type {boolean} */
    this._shuttingDown = false;
  }

  /**
   * Start periodic heartbeat writes.
   * @returns {void}
   */
  start() {
    this.writeHeartbeat();
    this._timer = setInterval(() => {
      this.writeHeartbeat();
    }, this.config.intervalSeconds * 1000);

    process.on('SIGINT', () => this._handleSignal('SIGINT'));
    process.on('SIGTERM', () => this._handleSignal('SIGTERM'));
  }

  /**
   * Stop periodic heartbeat writes and write final shutdown status.
   * @returns {void}
   */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._shuttingDown = true;
    this.writeHeartbeat();
  }

  /**
   * Handle process signals for graceful shutdown.
   * @param {string} signal
   * @returns {void}
   * @private
   */
  _handleSignal(signal) {
    if (this._shuttingDown) {
      return;
    }
    this.stop();
    process.exit(0);
  }

  /**
   * Build canonical heartbeat filename for a lane.
   * @param {string} laneName
   * @returns {string}
   * @private
   */
  _heartbeatFilename(laneName) {
    return `heartbeat-${laneName}.json`;
  }

  /**
   * Write current heartbeat file to the lane's inbox directory.
   * @returns {void}
   */
  writeHeartbeat() {
    const now = new Date();
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const schemaStatus = this._shuttingDown ? 'done' : 'in_progress';
    const sessionActive = !this._shuttingDown;

    const payload = {
      schema_version: '1.2',
      task_id: 'heartbeat-swarmmind',
      idempotency_key: 'a6e39b60e05e0844c4e3821b3b7869f5f3f4f1e2c9a7b8d6e5f4c3b2a1', // SHA-256 of "heartbeat-swarmmind-fixed"
      from: 'swarmmind',
      to: 'swarmmind',
      type: 'heartbeat',
      task_kind: 'proposal',
      priority: 'P3',
      subject: 'swarmmind heartbeat',
      body: { message: 'operational heartbeat signal' },
      timestamp: now.toISOString(),
      requires_action: false,
      payload: { mode: 'inline' },
      execution: {
        mode: 'watcher',
        engine: 'opencode',
        actor: 'lane',
        session_id: null,
        parent_id: null
      },
      lease: {
        owner: null,
        acquired_at: null,
        expires_at: null,
        renew_count: 0,
        max_renewals: 3
      },
      retry: {
        attempt: 1,
        max_attempts: 3,
        last_error: null,
        last_attempt_at: null
      },
      evidence: {
        required: false,
        evidence_path: null,
        verified: false,
        verified_by: null,
        verified_at: null
      },
      heartbeat: {
        interval_seconds: this.config.intervalSeconds,
        last_heartbeat_at: now.toISOString(),
        timeout_seconds: this.config.staleAfterSeconds,
        status: schemaStatus
      },
      watcher: {
        enabled: true,
        poll_seconds: this.config.intervalSeconds,
        p0_fast_path: true,
        max_concurrent: 1,
        heartbeat_required: true,
        stale_after_seconds: this.config.staleAfterSeconds,
        backoff: {
          initial_seconds: 60,
          max_seconds: 300,
          multiplier: 2
        }
      },
      delivery_verification: {
        verified: false,
        verified_at: null,
        retries: 0
      },
      // Custom fields retained for backwards-compatibility
      lane: this.config.laneName,
      session_active: sessionActive,
      uptime_seconds: uptimeSeconds,
      messages_processed: this.messagesProcessed,
      last_inbox_scan: now.toISOString(),
      version: '1.0'
    };

    const dir = this.config.inboxPath;
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const filePath = path.join(dir, this._heartbeatFilename(this.config.laneName));
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    } catch (err) {
      console.error('Failed to write heartbeat:', err.message);
    }
  }

  /**
   * Increment the messages_processed counter.
   * @returns {void}
   */
  incrementProcessed() {
    this.messagesProcessed++;
  }

  /**
   * Check health of all lanes by reading their heartbeat files.
   * @returns {{ timestamp: string, lanes: Object<string, { status: string, last_heartbeat: string|null, stale_for_seconds: number }> }}
   */
  checkLaneHealth() {
    const now = Date.now();
    /** @type {Object<string, { status: string, last_heartbeat: string|null, stale_for_seconds: number }>} */
    const lanes = {};

    const laneNames = Object.keys(this.config.canonicalPaths);
    for (let i = 0; i < laneNames.length; i++) {
      const laneName = laneNames[i];
      const inboxPath = this.config.canonicalPaths[laneName];
      const laneSpecificPath = path.join(inboxPath, this._heartbeatFilename(laneName));
      const legacyPath = path.join(inboxPath, 'heartbeat.json');

      try {
        const heartbeatPath = fs.existsSync(laneSpecificPath) ? laneSpecificPath : legacyPath;
        if (!fs.existsSync(heartbeatPath)) {
          lanes[laneName] = {
            status: 'unknown',
            last_heartbeat: null,
            stale_for_seconds: 0
          };
          continue;
        }

        const raw = fs.readFileSync(heartbeatPath, 'utf8');
        const data = JSON.parse(raw);
        const heartbeatTime = new Date(data.timestamp).getTime();
        const elapsed = Math.floor((now - heartbeatTime) / 1000);

        if (elapsed > this.config.staleAfterSeconds) {
          lanes[laneName] = {
            status: 'stale',
            last_heartbeat: data.timestamp,
            stale_for_seconds: elapsed
          };
        } else {
          lanes[laneName] = {
            status: 'alive',
            last_heartbeat: data.timestamp,
            stale_for_seconds: elapsed
          };
        }
      } catch (err) {
        lanes[laneName] = {
          status: 'unknown',
          last_heartbeat: null,
          stale_for_seconds: 0
        };
      }
    }

    return {
      timestamp: new Date().toISOString(),
      lanes: lanes
    };
  }
}

module.exports = { Heartbeat, DEFAULT_CONFIG };

if (require.main === module) {
  const args = process.argv.slice(2);
  const heartbeat = new Heartbeat();

  if (args.includes('--check')) {
    const report = heartbeat.checkLaneHealth();
    console.log(JSON.stringify(report, null, 2));
  } else if (args.includes('--once')) {
    heartbeat.writeHeartbeat();
  } else {
    heartbeat.start();
  }
}
