/**
 * Lane Resolver — canonical lane identification and cross-lane pointer validation.
 *
 * This module reads the authoritative LANE_REGISTRY.json from the Archivist-Agent
 * and determines which lane the current process belongs to, based on its working directory.
 *
 * It also validates that sibling lanes' repository paths exist and (optionally) match
 * the expected commit/branch, providing early detection of workspace divergence.
 *
 * Usage:
 *   const resolver = new LaneResolver();
 *   const myLane = resolver.getMyLane();        // 'swarmmind'
 *   const siblings = resolver.getSiblingLanes(); // [{lane_id: 'archivist', ...}, ...]
 *   const statePath = resolver.getStateFilePath('session_registry'); // absolute path
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class LaneResolver {
  /**
   * @param {object} options
   * @param {string} options.registryPath - Path to LANE_REGISTRY.json (absolute)
   * @param {boolean} options.validateCommits - Whether to verify sibling git HEAD matches registry (default true)
   */
  constructor(options = {}) {
    this.registryPath = options.registryPath || this._defaultRegistryPath();
    this.validateCommits = options.validateCommits !== false;
    this.registry = this._loadRegistry();
    this.myLane = this._identifyCurrentLane();
    this.myEntry = this.registry.lanes[this.myLane];
    this._setLaneEnv();  // set process.env for downstream modules
    this._validateSelf();
    this._validateSiblings();
  }

  _defaultRegistryPath() {
    // Try environment override first, then default location
    const envPath = process.env.LANE_REGISTRY_PATH;
    if (envPath) return envPath;
    // Archivist-Agent is governance root; default location relative to that
    // We assume the Archivist repo is at S:\Archivist-Agent (Windows path)
    return path.join('S:', 'Archivist-Agent', 'LANE_REGISTRY.json');
  }

  _loadRegistry() {
    if (!fs.existsSync(this.registryPath)) {
      throw new Error(`LANE_REGISTRY.json not found at ${this.registryPath}`);
    }
    try {
      const raw = fs.readFileSync(this.registryPath, 'utf8');
      const data = JSON.parse(raw);
      if (!data.authoritative) {
        console.warn('[LaneResolver] WARNING: LANE_REGISTRY.json is not marked authoritative');
      }
      return data;
    } catch (e) {
      throw new Error(`Failed to parse LANE_REGISTRY.json: ${e.message}`);
    }
  }

  /**
   * Identify which lane this process belongs to by matching cwd to repo_path
   */
  _identifyCurrentLane() {
    const cwd = path.resolve(process.cwd()).toLowerCase();
    for (const [laneId, entry] of Object.entries(this.registry.lanes)) {
      const repoPath = path.resolve(entry.repo_path).toLowerCase();
      if (cwd === repoPath || cwd.startsWith(repoPath + path.sep)) {
        return laneId;
      }
    }
    throw new Error(`Current directory ${process.cwd()} does not match any known lane repository path in LANE_REGISTRY.json`);
  }

  /**
   * After identifying lane, set process.env for downstream consumers
   */
  _setLaneEnv() {
    process.env.LANE_NAME = this.myLane;
    process.env.LANE_AUTHORITY = String(this.myEntry.authority);
    process.env.LANE_REPO_PATH = this.myEntry.repo_path;
    // Also set governance root to Archivist's repo path
    process.env.GOVERNANCE_ROOT = this.getGovernanceRoot();
  }

  /**
   * Validate that the current repo's HEAD commit matches the registry (if validation enabled)
   */
  _validateSelf() {
    if (!this.validateCommits) return;
    const expectedSha = this.myEntry.commit_sha;
    const actualSha = this._getCurrentGitHead(this.myEntry.repo_path);
    if (actualSha !== expectedSha) {
      console.warn(`[LaneResolver] WARNING: Current commit (${actualSha}) differs from registry (${expectedSha}) for ${this.myLane}`);
      console.warn('   This may indicate a drift; continuity verifier will detect on next startup.');
    }
  }

  /**
   * Validate sibling lanes exist and (optionally) their commits match
   */
  _validateSiblings() {
    for (const [laneId, entry] of Object.entries(this.registry.lanes)) {
      if (laneId === this.myLane) continue;
      if (!fs.existsSync(entry.repo_path)) {
        console.error(`[LaneResolver] ERROR: Sibling lane repository missing: ${laneId} at ${entry.repo_path}`);
        throw new Error(`Sibling lane repository not found: ${laneId}`);
      }
      if (this.validateCommits) {
        const actualSha = this._getCurrentGitHead(entry.repo_path);
        if (actualSha !== entry.commit_sha) {
          console.warn(`[LaneResolver] WARNING: Sibling ${laneId} commit mismatch. Expected ${entry.commit_sha}, actual ${actualSha}`);
        }
      }
    }
  }

  /**
   * Get current git HEAD SHA for a repository
   */
  _getCurrentGitHead(repoPath) {
    try {
      const stdout = execSync('git rev-parse HEAD', { cwd: repoPath, stdio: ['pipe', 'pipe', 'pipe'] });
      return stdout.toString().trim();
    } catch (e) {
      return 'unknown';
    }
  }

  /**
   * Get the current lane ID
   */
  getMyLane() {
    return this.myLane;
  }

  /**
   * Get the current lane's entry from the registry
   */
  getMyEntry() {
    return { ...this.myEntry };
  }

  /**
   * Get all sibling lane entries (excluding self)
   */
  getSiblingLanes() {
    return Object.entries(this.registry.lanes)
      .filter(([laneId]) => laneId !== this.myLane)
      .map(([laneId, entry]) => ({ lane_id: laneId, ...entry }));
  }

  /**
   * Get a specific sibling lane's entry by ID
   */
  getSiblingEntry(laneId) {
    if (laneId === this.myLane) throw new Error('Cannot get self as sibling; use getMyEntry()');
    const entry = this.registry.lanes[laneId];
    if (!entry) throw new Error(`Unknown sibling lane: ${laneId}`);
    return { ...entry };
  }

  /**
   * Resolve an absolute path to a state file for the current lane
   */
  getStateFilePath(stateFileName) {
    const repoPath = this.myEntry.repo_path;
    // If it's a known state file name (not already absolute), join to repo root
    if (path.isAbsolute(stateFileName)) return stateFileName;
    return path.join(repoPath, stateFileName);
  }

  /**
   * Get the global queue directory
   */
  getQueueDirectory() {
    return this.registry.global_state.queue_directory;
  }

  /**
   * Get the global audit directory
   */
  getAuditDirectory() {
    return this.registry.global_state.audit_directory;
  }

  /**
   * Get the global continuity directory
   */
  getContinuityDirectory() {
    return this.registry.global_state.continuity_directory;
  }

  /**
   * Check if a given path is within the current lane's repository
   */
  isPathInLane(filePath) {
    const abs = path.resolve(filePath).toLowerCase();
    const repoPath = path.resolve(this.myEntry.repo_path).toLowerCase();
    return abs === repoPath || abs.startsWith(repoPath + path.sep);
  }

  /**
   * Get the authoritative governance root (Archivist repo path)
   */
  getGovernanceRoot() {
    return this.registry.lanes.archivist.repo_path;
  }

  /**
   * Dump a summary for debugging
   */
  dumpSummary() {
    console.log('[LaneResolver] Registry loaded:', this.registryPath);
    console.log('  Current lane:', this.myLane);
    console.log('  Authority:', this.myEntry.authority);
    console.log('  Repo:', this.myEntry.repo_path);
    console.log('  Commit:', this.myEntry.commit_sha);
    console.log('  Siblings:', this.getSiblingLanes().map(s => s.lane_id).join(', '));
  }
}

module.exports = { LaneResolver };
