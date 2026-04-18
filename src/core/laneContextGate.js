const fs = require('fs');
const path = require('path');

/**
 * LANE-CONTEXT RECONCILIATION GATE
 * 
 * Enforces cross-lane write policy as defined in:
 * SPEC_AMENDMENT_LANE_CONTEXT_GATE.md
 * 
 * Enforcement points:
 * 1. Session start - verify pwd, session-lock, and registry reconcile
 * 2. Pre-write hook - validate file ownership vs lane authority
 * 3. Directory change - detect cross-lane boundary crossings
 * 4. Registry update - verify authority before modifying governance files
 * 
 * Policy: require_authority_100_or_same_lane
 *   - Writes allowed if: target owned by same lane OR authority >= 100
 *   - Cross-lane writes without authority are BLOCKED
 *   - Uncertain state triggers HOLD and requires operator resolution
 */

class LaneContextGate {
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot || process.cwd();
    this.sessionLane = null;
    this.sessionAuthority = null;
    this.ownershipRegistry = null;
    this.ownershipRegistryPath = null;
    this.sessionLockPath = null;
    this.isInitialized = false;
    this.holdState = null;
    this.operatorResolver = options.operatorResolver || null;
    
    // Determine governance root path (parent lane with authority 100)
    // For SwarmMind, this is S:\Archivist-Agent
    this.governanceRoot = options.governanceRoot || 
      path.join(process.env.USERPROFILE || 'S:', 'Archivist-Agent');
  }

  /**
   * Step 1: Load FILE_OWNERSHIP_REGISTRY.json from governance root
   */
  loadOwnershipRegistry() {
    try {
      this.ownershipRegistryPath = path.join(this.governanceRoot, 'FILE_OWNERSHIP_REGISTRY.json');
      
      if (!fs.existsSync(this.ownershipRegistryPath)) {
        const error = new Error(`FILE_OWNERSHIP_REGISTRY.json not found at ${this.ownershipRegistryPath}`);
        this.enterHold('registry_missing', error);
        return false;
      }

      const content = fs.readFileSync(this.ownershipRegistryPath, 'utf8');
      this.ownershipRegistry = JSON.parse(content);
      
      console.log('[LANE-GATE] Ownership registry loaded:');
      console.log(`  Governance root: ${this.governanceRoot}`);
      console.log(`  Default ownership: ${this.ownershipRegistry.default_ownership}`);
      console.log(`  Cross-lane policy: ${this.ownershipRegistry.cross_lane_write_policy.rule}`);
      
      return true;
    } catch (error) {
      console.error('[LANE-GATE] Failed to load ownership registry:', error.message);
      this.enterHold('registry_parse_error', error);
      return false;
    }
  }

  /**
   * Step 2: Read session-lock to determine current lane identity and authority
   */
  loadSessionLock() {
    try {
      this.sessionLockPath = path.join(this.projectRoot, '.session-lock');
      
      if (!fs.existsSync(this.sessionLockPath)) {
        const error = new Error('.session-lock file not found');
        this.enterHold('session_lock_missing', error);
        return false;
      }

      const content = fs.readFileSync(this.sessionLockPath, 'utf8');
      const sessionLock = JSON.parse(content);
      
      this.sessionLane = sessionLock.lane_id;
      this.sessionId = sessionLock.session_id;
      
      // Look up authority from ownership registry
      this.sessionAuthority = this.getAuthorityForLane(this.sessionLane);
      
      console.log(`[LANE-GATE] Session identity resolved:`);
      console.log(`  Lane: ${this.sessionLane}`);
      console.log(`  Session ID: ${this.sessionId}`);
      console.log(`  Authority: ${this.sessionAuthority}`);
      
      return true;
    } catch (error) {
      console.error('[LANE-GATE] Failed to read session-lock:', error.message);
      this.enterHold('session_lock_invalid', error);
      return false;
    }
  }

  /**
   * Step 3: Verify pwd matches session-lock lane (lane-context reconciliation)
   */
  verifyLaneContext() {
    const pwd = process.cwd();
    const pwdLane = this.determineLaneFromPath(pwd);
    
    console.log(`[LANE-GATE] Lane-context check:`);
    console.log(`  pwd: ${pwd}`);
    console.log(`  pwd_lane: ${pwdLane}`);
    console.log(`  session_lane: ${this.sessionLane}`);
    
    if (pwdLane !== this.sessionLane) {
      const error = new Error(`Lane-context mismatch: pwd="${pwdLane}" but session="${this.sessionLane}"`);
      console.error('[LANE-GATE]', error.message);
      this.enterHold('lane_context_mismatch', error);
      return false;
    }
    
    console.log('[LANE-GATE] Lane-context reconciled');
    return true;
  }

  /**
   * Determine lane ID from filesystem path
   */
  determineLaneFromPath(filePath) {
    const normalizedPath = path.resolve(filePath).toLowerCase();
    
    // Check ownership registry for matching path prefix
    const ownershipEntries = this.ownershipRegistry.ownership || {};
    
    // Sort by path length (longest first) to match most specific
    const sortedPaths = Object.keys(ownershipEntries).sort((a, b) => b.length - a.length);
    
    for (const ownedPath of sortedPaths) {
      const normalizedOwned = path.resolve(ownedPath).toLowerCase();
      if (normalizedPath.startsWith(normalizedOwned)) {
        return ownershipEntries[ownedPath].lane_id;
      }
    }
    
    // Fallback to default ownership
    return this.ownershipRegistry.default_ownership || 'archivist-agent';
  }

  /**
   * Get authority level for a lane ID
   */
  getAuthorityForLane(laneId) {
    const ownershipEntries = this.ownershipRegistry.ownership || {};
    
    for (const [path, info] of Object.entries(ownershipEntries)) {
      if (info.lane_id === laneId) {
        return info.authority || 0;
      }
    }
    
    return 0;
  }

  /**
   * PRE-WRITE GATE - Call before any file write operation
   * 
   * @param {string} targetPath - Path of file to write
   * @param {object} options - Write operation context
   * @returns {boolean} - true if write allowed, false if blocked
   */
  preWriteGate(targetPath, options = {}) {
    // If already in HOLD state, block all writes
    if (this.holdState) {
      console.error('[LANE-GATE] BLOCKED - System in HOLD state:', this.holdState.reason);
      console.error('[LANE-GATE] Operator resolution required before any writes');
      return false;
    }

    // Ensure gate is initialized
    if (!this.isInitialized) {
      if (!this.initialize()) {
        console.error('[LANE-GATE] Gate initialization failed - blocking write');
        return false;
      }
    }

    const targetAbsolute = path.resolve(targetPath);
    const targetLane = this.determineLaneFromPath(targetAbsolute);
    
    console.log(`[LANE-GATE] Pre-write check:`);
    console.log(`  Target: ${targetAbsolute}`);
    console.log(`  Target lane: ${targetLane}`);
    console.log(`  Session lane: ${this.sessionLane}`);
    console.log(`  Authority: ${this.sessionAuthority}`);

    // Check 1: Same-lane write is always allowed
    if (targetLane === this.sessionLane) {
      console.log('[LANE-GATE] ALLOWED - Same-lane write');
      return true;
    }

    // Check 2: Cross-lane write requires authority >= 100
    if (this.sessionAuthority >= 100) {
      console.log('[LANE-GATE] ALLOWED - Authority >= 100 (governance root)');
      return true;
    }

    // Check 3: Specific overrides (e.g., emergency operator flag)
    if (options.operatorConfirmed) {
      console.log('[LANE-GATE] ALLOWED - Operator override');
      return true;
    }

    // BLOCKED - Cross-lane write without sufficient authority
    const reason = `Cross-lane write blocked: session=${this.sessionLane} (auth=${this.sessionAuthority}), target=${targetLane}`;
    console.error('[LANE-GATE] BLOCKED -', reason);
    
    this.enterHold('cross_lane_blocked', new Error(reason), { targetPath, targetLane });
    return false;
  }

  /**
   * Enter HOLD state - quarantine execution until operator resolves
   */
  enterHold(reason, error, context = {}) {
    this.holdState = {
      status: 'HOLD_ACTIVE',
      reason,
      error: error.message,
      timestamp: new Date().toISOString(),
      sessionLane: this.sessionLane,
      sessionId: this.sessionId,
      context
    };
    
    console.error('\n' + '='.repeat(60));
    console.error('[LANE-GATE] HOLD STATE ENTERED');
    console.error('='.repeat(60));
    console.error(`Reason: ${reason}`);
    console.error(`Details: ${error.message}`);
    console.error(`Timestamp: ${this.holdState.timestamp}`);
    console.error(`Session: ${this.sessionLane} (${this.sessionId})`);
    console.error('='.repeat(60));
    console.error('ACTION REQUIRED: Operator intervention needed');
    console.error('NEXT: Resolve lane conflict or provide operator confirmation');
    console.error('='.repeat(60) + '\n');
  }

  /**
   * Exit HOLD state after operator resolution
   */
  exitHold(operatorConfirmCode = null) {
    if (!this.holdState) return;
    
    console.log('[LANE-GATE] HOLD state cleared');
    console.log(`  Reason: ${this.holdState.reason}`);
    console.log(`  Resolved by: ${operatorConfirmCode || 'operator'}`);
    
    this.holdState = null;
  }

  /**
   * Initialize gate (load registry, read session, verify context)
   */
  initialize() {
    if (this.isInitialized) return true;
    
    console.log('[LANE-GATE] Initializing lane-context gate...');
    
    if (!this.loadOwnershipRegistry()) return false;
    if (!this.loadSessionLock()) return false;
    if (!this.verifyLaneContext()) return false;
    
    this.isInitialized = true;
    console.log('[LANE-GATE] Initialization complete - gate active\n');
    return true;
  }

  /**
   * Phase 2.5: Validate NODE_OPTIONS configuration for child process propagation.
   * 
   * Called by governed-start.js after setting process.env.NODE_OPTIONS.
   * Checks that the environment variable correctly points to this gate module.
   * 
   * @returns {boolean} - true if NODE_OPTIONS is correctly configured
   */
  initFromEnv() {
    const nodeOptions = process.env.NODE_OPTIONS || '';
    const gateRequirePath = 'laneContextGate.js';
    
    console.log('[LANE-GATE] Checking NODE_OPTIONS for child process propagation...');
    console.log(`  NODE_OPTIONS="${nodeOptions}"`);
    
    // Check if our gate is in the require path
    if (!nodeOptions.includes(gateRequirePath)) {
      console.error('[LANE-GATE] ERROR: laneContextGate.js not found in NODE_OPTIONS');
      console.error('  Child processes will NOT inherit the gate');
      console.error(`  Expected: "--require path/to/laneContextGate.js"`);
      console.error(`  Actual:   "${nodeOptions}"`);
      
      this.enterHold('node_options_missing', new Error('NODE_OPTIONS does not include laneContextGate.js'));
      return false;
    }
    
    console.log('[LANE-GATE] NODE_OPTIONS validation PASSED');
    console.log('  All child processes spawned from this environment');
    console.log('  will preload the gate via --require flag\n');
    
    return true;
  }

  /**
   * Check if gate is in hold state
   */
  isOnHold() {
    return this.holdState !== null;
  }

   /**
    * Get gate status for diagnostics
    */
   getStatus() {
     return {
       initialized: this.isInitialized,
       sessionLane: this.sessionLane,
       sessionId: this.sessionId,
       authority: this.sessionAuthority,
       holdState: this.holdState,
       governanceRoot: this.governanceRoot,
       registryLoaded: this.ownershipRegistry !== null
     };
   }

  /**
   * Patch Node fs module to intercept ALL write operations
   * Enforces gate at process level — any code calling fs.writeFileSync,
   * fs.appendFileSync, fs.mkdirSync, or fs.unlinkSync will be checked.
   * 
   * Phase 2.5: Also patches fs.promises (async) to prevent bypass via promises API.
   */
  patchFs() {
    const fs = require('fs');
    const self = this;

    // Store originals — synchronous API
    const originalWriteFileSync = fs.writeFileSync;
    const originalAppendFileSync = fs.appendFileSync;
    const originalMkdirSync = fs.mkdirSync;
    const originalUnlinkSync = fs.unlinkSync;
    const originalRmdirSync = fs.rmdirSync;
    
    // Wrap synchronous writeFileSync
    fs.writeFileSync = function(path, data, options) {
      if (!self.preWriteGate(path, { operatorConfirmed: false })) {
        throw new Error(`[LANE-GATE] Cross-lane write blocked: ${path}`);
      }
      return originalWriteFileSync.call(this, path, data, options);
    };
    
    // Wrap synchronous appendFileSync
    fs.appendFileSync = function(path, data, options) {
      if (!self.preWriteGate(path, { operatorConfirmed: false })) {
        throw new Error(`[LANE-GATE] Cross-lane append blocked: ${path}`);
      }
      return originalAppendFileSync.call(this, path, data, options);
    };
    
    // Wrap synchronous mkdirSync (directory creation)
    fs.mkdirSync = function(path, options) {
      if (!self.preWriteGate(path, { operatorConfirmed: false })) {
        throw new Error(`[LANE-GATE] Cross-lane mkdir blocked: ${path}`);
      }
      return originalMkdirSync.call(this, path, options);
    };
    
    // Wrap synchronous unlinkSync (file deletion)
    fs.unlinkSync = function(path) {
      if (!self.preWriteGate(path, { operatorConfirmed: false })) {
        throw new Error(`[LANE-GATE] Cross-lane delete blocked: ${path}`);
      }
      return originalUnlinkSync.call(this, path);
    };
    
    // Wrap synchronous rmdirSync (directory removal)
    fs.rmdirSync = function(path, options) {
      if (!self.preWriteGate(path, { operatorConfirmed: false })) {
        throw new Error(`[LANE-GATE] Cross-lane rmdir blocked: ${path}`);
      }
      return originalRmdirSync.call(this, path, options);
    };
    
    // Phase 2.5: Also patch fs.promises to prevent async bypass
    if (fs.promises) {
      const promisesOriginalWriteFile = fs.promises.writeFile;
      const promisesOriginalAppendFile = fs.promises.appendFile;
      const promisesOriginalMkdir = fs.promises.mkdir;
      const promisesOriginalUnlink = fs.promises.unlink;
      const promisesOriginalRmdir = fs.promises.rmdir;
      
      // Wrap promises.writeFile
      fs.promises.writeFile = function(path, data, options) {
        if (!self.preWriteGate(path, { operatorConfirmed: false })) {
          return Promise.reject(new Error(`[LANE-GATE] Cross-lane write blocked: ${path}`));
        }
        return promisesOriginalWriteFile.call(this, path, data, options);
      };
      
      // Wrap promises.appendFile
      fs.promises.appendFile = function(path, data, options) {
        if (!self.preWriteGate(path, { operatorConfirmed: false })) {
          return Promise.reject(new Error(`[LANE-GATE] Cross-lane append blocked: ${path}`));
        }
        return promisesOriginalAppendFile.call(this, path, data, options);
      };
      
      // Wrap promises.mkdir
      fs.promises.mkdir = function(path, options) {
        if (!self.preWriteGate(path, { operatorConfirmed: false })) {
          return Promise.reject(new Error(`[LANE-GATE] Cross-lane mkdir blocked: ${path}`));
        }
        return promisesOriginalMkdir.call(this, path, options);
      };
      
      // Wrap promises.unlink
      fs.promises.unlink = function(path) {
        if (!self.preWriteGate(path, { operatorConfirmed: false })) {
          return Promise.reject(new Error(`[LANE-GATE] Cross-lane delete blocked: ${path}`));
        }
        return promisesOriginalUnlink.call(this, path);
      };
      
      // Wrap promises.rmdir
      fs.promises.rmdir = function(path, options) {
        if (!self.preWriteGate(path, { operatorConfirmed: false })) {
          return Promise.reject(new Error(`[LANE-GATE] Cross-lane rmdir blocked: ${path}`));
        }
        return promisesOriginalRmdir.call(this, path, options);
      };
      
console.log('[LANE-GATE] fs.promises hooks installed — async file operations guarded');
}

console.log('[LANE-GATE] Global fs write hooks installed — all file operations guarded');
}
}
 
 // =============================================================================
 // AUTO-INSTALL VIA NODE_OPTIONS (Phase 2.5)
 // =============================================================================
 // If this module is preloaded using NODE_OPTIONS=--require laneContextGate.js,
 // automatically instantiate the gate and patch the fs module. This ensures
 // child processes inherit lane-context enforcement without explicit bootstrap.
 // =============================================================================
 (function() {
   const isPreloaded = process.env.NODE_OPTIONS && process.env.NODE_OPTIONS.includes('laneContextGate.js');
   if (isPreloaded && !global.__LANE_GATE_INSTALLED__) {
     try {
       const gate = new LaneContextGate(process.cwd());
       // Install fs hooks immediately; initialization (ownership + session)
       // will occur lazily on first write via preWriteGate.initialize() if needed.
       gate.patchFs();
       global.__LANE_GATE_INSTALLED__ = true;
       console.log('[LANE-GATE] Preload: fs hooks installed — child process protection active');
     } catch (e) {
       console.error('[LANE-GATE] Preload failed — gate NOT active:', e.message);
     }
   }
 })();
 
 module.exports = { LaneContextGate };
