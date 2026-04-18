#!/usr/bin/env node
/**
 * GOVERNANCE RESOLVER - THREE MODE ARCHITECTURE
 * 
 * Purpose: Bridge SwarmMind's local context to Archivist-Agent's governance context
 * 
 * Modes Supported:
 * - governed-standalone: Archivist-governed child (governance_active=true, external_lane=true)
 * - standalone-lattice: Runs alone + exports to external verifier (governance_active=false, external_lane=true)
 * - isolated-demo: Local only (governance_active=false, external_lane=false)
 * 
 * Evidence: CONTEXT_BOUNDARY_FAILURE_2026-04-16.md
 * "Governance is documented as inherited, but not declared as discoverable"
 */

const fs = require('fs');
const path = require('path');

// Detect if terminal supports Unicode/ANSI
const supportsColor = process.stdout.isTTY && process.platform !== 'win32';

// ASCII-safe prefixes (fallback for Windows/PowerShell)
const ASCII_PREFIX = {
    info: '[i]',
    success: '[+]',
    warning: '[!]',
    error: '[-]',
    header: '',
    mode: '',
    reset: ''
};

// ANSI color codes for terminals that support them
const COLORS = {
    RESET: supportsColor ? '\x1b[0m' : '',
    RED: supportsColor ? '\x1b[31m' : '',
    GREEN: supportsColor ? '\x1b[32m' : '',
    YELLOW: supportsColor ? '\x1b[33m' : '',
    BLUE: supportsColor ? '\x1b[34m' : '',
    CYAN: supportsColor ? '\x1b[36m' : '',
    MAGENTA: supportsColor ? '\x1b[35m' : '',
    WHITE: supportsColor ? '\x1b[37m' : '',
    BOLD: supportsColor ? '\x1b[1m' : ''
};

// Unicode symbols for terminals that support them
const UNICODE_PREFIX = {
    info: `${COLORS.BLUE}i${COLORS.RESET}`,
    success: `${COLORS.GREEN}+${COLORS.RESET}`,
    warning: `${COLORS.YELLOW}!${COLORS.RESET}`,
    error: `${COLORS.RED}-${COLORS.RESET}`,
    header: '',
    mode: '',
    reset: ''
};

class GovernanceResolver {
    constructor(projectRoot) {
        this.projectRoot = projectRoot || process.cwd();
        this.manifest = null;
        this.governanceContext = null;
        this.resolutionStatus = 'not_started';
        this.activeMode = null;
        this.modeConfig = null;
        this.externalLaneConfig = null;
        this.quarantineState = null;
    }

    log(message, level = 'info') {
        const prefix = process.platform === 'win32' ? ASCII_PREFIX : UNICODE_PREFIX;
        const icon = prefix[level] || '';
        const colorStart = level === 'header' ? COLORS.BOLD + COLORS.CYAN :
            level === 'mode' ? COLORS.BOLD + COLORS.MAGENTA : '';
        const colorEnd = (level === 'header' || level === 'mode' || level === 'reset') ? '' : COLORS.RESET;

        console.log(`${colorStart}${icon} ${message}${colorEnd}`);
    }

    /**
     * QUARANTINE ENTRY - ENFORCED STATE TRANSITION
     * 
     * This method is called when verification fails.
     * It does NOT just log - it transitions runtime state.
     * 
     * @param {number} exitCode - Verification exit code (2=untrusted, 4=fingerprint, other=unknown)
     * @returns {object} - Quarantine result (does NOT continue normal execution)
     */
    enterQuarantine(exitCode) {
        const QUARANTINE_REASON = {
            2: 'RECONSTRUCTED_UNTRUSTED',
            4: 'FINGERPRINT_MISMATCH',
            'default': 'UNKNOWN_FAILURE'
        };

        const reason = QUARANTINE_REASON[exitCode] || QUARANTINE_REASON.default;
        const isCritical = exitCode === 4;

        this.log('\n' + '='.repeat(60), 'header');
        this.log(`QUARANTINE: ${reason}`, isCritical ? 'error' : 'warning');
        this.log('='.repeat(60), 'header');
        this.log(`Exit code: ${exitCode}`, 'info');
        this.log('Authority: RESTRICTED to observer only', isCritical ? 'error' : 'warning');
        this.log('Governance mode: BLOCKED', 'error');
        this.log('Resume path: Re-verification required', 'warning');

        // STATE TRANSITION - not just logging
        this.activeMode = isCritical ? 'quarantine-critical' : 'quarantine-reconstructed';
        this.modeConfig = {
            governance_active: false,
            external_lane_enabled: false,
            claim_limit: 'NONE',
            authority_restricted: true,
            requires_reverification: true,
            requires_manual_verification: isCritical
        };

        // Load last valid phenotype
        const phenotypePath = path.join(this.projectRoot, '..', 'Archivist-Agent', 'PHENOTYPE_REGISTRY.json');
        let phenotypeLoaded = false;

        if (fs.existsSync(phenotypePath)) {
            try {
                const phenotype = JSON.parse(fs.readFileSync(phenotypePath, 'utf8'));
                this.log(`Last valid phenotype: ${phenotype.generated_at}`, 'success');
                phenotypeLoaded = true;
            } catch (e) {
                this.log('Phenotype parse failed', 'error');
            }
        } else {
            this.log('No phenotype registry found', 'warning');
        }

        // PERSISTENT STATE - quarantine state file
        const quarantineState = {
            status: 'QUARANTINE_ACTIVE',
            reason: reason,
            exit_code: exitCode,
            timestamp: new Date().toISOString(),
            authority_level: 'observer_only',
            governance_blocked: true,
            phenotype_available: phenotypeLoaded,
            action_required: isCritical ? 'manual_verification' : 're_verification',
            resumption_blocked: true,
            resume_command: 'node resolve-governance-v2.js --release-quarantine'
        };

        const quarantinePath = path.join(this.projectRoot, 'QUARANTINE_STATE.json');
        fs.writeFileSync(quarantinePath, JSON.stringify(quarantineState, null, 2));
        this.log(`Quarantine state: ${quarantinePath}`, 'warning');

        this.externalLaneConfig = {
            type: 'quarantine',
            claim_limit: 'NONE',
            phenotype_loaded: phenotypeLoaded,
            reverification_required: true,
            manual_verification_required: isCritical
        };

        this.log('\n' + '='.repeat(60), 'header');
        this.log('QUARANTINE ACTIVE - NORMAL OPERATION BLOCKED', 'error');
        this.log('='.repeat(60), 'header');

        return this.emitResult();
    }

    /**
     * QUARANTINE RELEASE PROTOCOL
     * Call this to exit quarantine mode after re-verification
     */
    async releaseFromQuarantine() {
        const quarantinePath = path.join(this.projectRoot, 'QUARANTINE_STATE.json');
        
        if (!fs.existsSync(quarantinePath)) {
            this.log('No quarantine state found - already clear', 'success');
            return { released: true, reason: 'no_quarantine' };
        }
        
        this.log('\n' + '='.repeat(60), 'header');
        this.log('QUARANTINE RELEASE PROTOCOL', 'header');
        this.log('='.repeat(60), 'header');
        
        // Load quarantine state
        try {
            this.quarantineState = JSON.parse(fs.readFileSync(quarantinePath, 'utf8'));
            this.log(`Quarantine reason: ${this.quarantineState.reason}`, 'warning');
            this.log(`Quarantine timestamp: ${this.quarantineState.timestamp}`, 'info');
        } catch (e) {
            this.log('Could not parse quarantine state', 'error');
            return { released: false, reason: 'invalid_quarantine_state' };
        }
        
        // Step 1: Re-run verification
        this.log('\nStep 1: Re-running recovery verification...', 'info');
        const verifyScript = path.join(this.projectRoot, 'verify_recovery.sh');
        
        if (!fs.existsSync(verifyScript)) {
            this.log('ERROR: verify_recovery.sh not found', 'error');
            return { released: false, reason: 'verification_script_missing' };
        }
        
        try {
            const { execSync } = require('child_process');
            execSync(`bash "${verifyScript}"`, { stdio: 'pipe', timeout: 30000 });
            this.log('PASS: Verification succeeded', 'success');
        } catch (error) {
            const code = error.status || 1;
            this.log(`FAIL: Verification still failing (code ${code})`, 'error');
            this.log('Cannot release from quarantine - manual intervention required', 'error');
            return { released: false, reason: 'verification_still_failing', code };
        }
        
        // Step 2: Clear quarantine state
        this.log('\nStep 2: Clearing quarantine state...', 'info');
        fs.unlinkSync(quarantinePath);
        this.log('Quarantine state file removed', 'success');
        
        // Step 3: Restore normal operation
        this.log('\nStep 3: Restoring normal operation...', 'info');
        this.activeMode = null;
        this.modeConfig = null;
        this.quarantineState = null;
        
        this.log('\n' + '='.repeat(60), 'header');
        this.log('QUARANTINE RELEASED - NORMAL OPERATION RESUMED', 'success');
        this.log('='.repeat(60), 'header');
        
        return { released: true, reason: 'verification_passed' };
    }

    log(message, level = 'info') {
        // Use ASCII on Windows, Unicode elsewhere
        const prefix = process.platform === 'win32' ? ASCII_PREFIX : UNICODE_PREFIX;
        const icon = prefix[level] || '';
        const colorStart = level === 'header' ? COLORS.BOLD + COLORS.CYAN : 
                           level === 'mode' ? COLORS.BOLD + COLORS.MAGENTA : '';
        const colorEnd = (level === 'header' || level === 'mode' || level === 'reset') ? '' : COLORS.RESET;
        
        console.log(`${colorStart}${icon} ${message}${colorEnd}`);
    }

  /**
   * Step 1: Check for governance manifest
   */
  detectManifest() {
    const manifestPath = path.join(this.projectRoot, 'GOVERNANCE_MANIFEST.json');
    
    if (!fs.existsSync(manifestPath)) {
      this.log('No GOVERNANCE_MANIFEST.json found', 'warning');
      this.log('Operating in isolated-demo mode (no parent governance)', 'warning');
      this.resolutionStatus = 'isolated';
      this.activeMode = 'isolated-demo';
      this.modeConfig = {
        governance_active: false,
        external_lane_enabled: false,
        claim_limit: 'none'
      };
      return false;
    }

    try {
      const content = fs.readFileSync(manifestPath, 'utf8');
      this.manifest = JSON.parse(content);
      this.log('Governance manifest detected', 'success');
      this.log(`  Project: ${this.manifest.project.name}`, 'info');
      this.log(`  Relationship: ${this.manifest.governance.relationship}`, 'info');
      return true;
    } catch (error) {
      this.log(`Failed to parse manifest: ${error.message}`, 'error');
      this.resolutionStatus = 'manifest_parse_error';
      return false;
    }
  }

  /**
   * Step 2: Determine runtime mode
   */
  determineMode() {
    if (!this.manifest) {
      this.activeMode = 'isolated-demo';
      this.modeConfig = {
        governance_active: false,
        external_lane_enabled: false,
        claim_limit: 'none'
      };
      return 'isolated-demo';
    }

    // Check for CLI flag
    const cliMode = process.argv.find(arg => arg.startsWith('--mode='));
    if (cliMode) {
      const mode = cliMode.split('=')[1];
      if (this.manifest.runtime.modes[mode]) {
        this.activeMode = mode;
        this.modeConfig = this.manifest.runtime.modes[mode];
        this.log(`Mode set via CLI flag: ${mode}`, 'success');
        return mode;
      }
    }

    // Check for environment variable
    const envMode = process.env.SWARMIND_MODE;
    if (envMode && this.manifest.runtime.modes[envMode]) {
      this.activeMode = envMode;
      this.modeConfig = this.manifest.runtime.modes[envMode];
      this.log(`Mode set via environment: ${envMode}`, 'success');
      return envMode;
    }

    // Auto-detect based on manifest default
    const defaultMode = this.manifest.runtime.mode;
    if (this.manifest.runtime.modes[defaultMode]) {
      this.activeMode = defaultMode;
      this.modeConfig = this.manifest.runtime.modes[defaultMode];
      this.log(`Mode set from manifest default: ${defaultMode}`, 'success');
      return defaultMode;
    }

    // Fallback to isolated
    this.activeMode = 'isolated-demo';
    this.modeConfig = {
      governance_active: false,
      external_lane_enabled: false,
      claim_limit: 'none'
    };
    this.log('No valid mode found, falling back to isolated-demo', 'warning');
    return 'isolated-demo';
  }

  /**
   * Step 3: Resolve parent governance root (only if governance_active)
   */
  resolveParentGovernance() {
    if (!this.modeConfig.governance_active) {
      this.log('Governance inactive for this mode, skipping parent resolution', 'info');
      return true;
    }

    if (!this.manifest) {
      this.log('No manifest loaded, cannot resolve parent', 'error');
      return false;
    }

    const parentPath = this.manifest.governance.inherits_from;
    
    if (!fs.existsSync(parentPath)) {
      this.log(`Parent governance root not found: ${parentPath}`, 'error');
      this.log('Cannot proceed with governance inheritance', 'error');
      this.resolutionStatus = 'parent_not_found';
      return false;
    }

    this.log(`Parent governance root resolved: ${parentPath}`, 'success');
    return true;
  }

  /**
   * Step 4: Verify bootstrap exists (only if governance_active)
   */
  verifyBootstrap() {
    if (!this.modeConfig.governance_active) {
      this.log('Governance inactive, skipping bootstrap verification', 'info');
      return true;
    }

    if (!this.manifest) {
      return false;
    }

    const bootstrapPath = this.manifest.governance.bootstrap_path;
    
    if (!fs.existsSync(bootstrapPath)) {
      this.log(`BOOTSTRAP.md not found: ${bootstrapPath}`, 'error');
      this.log('Critical: Single entry point cannot be established', 'error');
      this.resolutionStatus = 'bootstrap_missing';
      return false;
    }

    this.log(`Bootstrap path verified: ${bootstrapPath}`, 'success');
    return true;
  }

  /**
   * Step 5: Load governance context (only if governance_active)
   */
  loadGovernanceContext() {
    if (!this.modeConfig.governance_active) {
      this.log('Governance inactive, skipping context loading', 'info');
      return true;
    }

    if (!this.manifest) {
      return false;
    }

    const contextFiles = {
      bootstrap: this.manifest.governance.bootstrap_path,
      registry: this.manifest.governance.registry_path,
      agents: path.join(this.manifest.governance.inherits_from, 'AGENTS.md'),
      sessionInit: path.join(this.manifest.governance.inherits_from, 'SESSION_INIT.md')
    };

    this.governanceContext = {
      files: {},
      loaded: false
    };

    let allLoaded = true;
    
    for (const [name, filePath] of Object.entries(contextFiles)) {
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          this.governanceContext.files[name] = {
            path: filePath,
            exists: true,
            content: content,
            size: content.length
          };
          this.log(`  Loaded ${name}: ${filePath}`, 'success');
        } catch (error) {
          this.log(`  Failed to load ${name}: ${error.message}`, 'warning');
          this.governanceContext.files[name] = {
            path: filePath,
            exists: true,
            error: error.message
          };
          allLoaded = false;
        }
      } else {
        this.log(`  ${name} not found: ${filePath}`, 'warning');
        this.governanceContext.files[name] = {
          path: filePath,
          exists: false
        };
        allLoaded = false;
      }
    }

    this.governanceContext.loaded = allLoaded;
    return allLoaded;
  }

  /**
   * Step 6: Register project relationship (only if governance_active)
   */
  registerProjectRelationship() {
    if (!this.modeConfig.governance_active) {
      this.log('Governance inactive, skipping project registration', 'info');
      return true;
    }

    if (!this.manifest) {
      return false;
    }

    const registryPath = this.manifest.governance.registry_path;
    
    if (!fs.existsSync(registryPath)) {
      this.log('Cannot verify project registration: registry not found', 'warning');
      return false;
    }

    try {
      const registryContent = fs.readFileSync(registryPath, 'utf8');
      const projectName = this.manifest.project.name;
      
      if (registryContent.includes(projectName)) {
        this.log(`Project "${projectName}" found in registry`, 'success');
        
if (registryContent.includes('integration-target') && registryContent.includes(projectName)) {
            this.log('Relationship confirmed: integration-target', 'success');
        } else {
            this.log('WARNING: relationship type not verified in registry', 'warning');
        }
        
        return true;
      } else {
        this.log(`Project "${projectName}" NOT found in registry`, 'error');
        this.log('This project may not be properly registered', 'error');
        return false;
      }
    } catch (error) {
      this.log(`Failed to read registry: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Step 7: Expose extension hooks (only if governance_active OR external_lane_enabled)
   */
  exposeExtensionHooks() {
    if (!this.modeConfig.governance_active && !this.modeConfig.external_lane_enabled) {
      this.log('No governance or external lanes, skipping extension hooks', 'info');
      return true;
    }

    if (!this.manifest) {
      return false;
    }

    const extensionPath = this.manifest.governance.extension_path;
    
    if (!fs.existsSync(extensionPath)) {
      this.log(`Extension path not found: ${extensionPath}`, 'warning');
      if (this.modeConfig.governance_active) {
        this.log('Extension required for governance mode', 'error');
        return false;
      }
      return true;
    }

    // Check for CLI
    const cliPath = this.manifest.integration.governance_extension.cli_path;
    if (fs.existsSync(cliPath)) {
      this.log(`Extension CLI available: ${cliPath}`, 'success');
    } else {
      this.log(`Extension CLI not found: ${cliPath}`, 'warning');
    }

    // Check for schema
    const schemaPath = this.manifest.integration.governance_extension.schema_path;
    if (fs.existsSync(schemaPath)) {
      this.log(`Extension schema available: ${schemaPath}`, 'success');
    } else {
      this.log(`Extension schema not found: ${schemaPath}`, 'warning');
    }

    this.log(`Extension mode: ${this.manifest.integration.governance_extension.mode}`, 'info');
    this.log(`Fields to be added: ${this.manifest.integration.governance_extension.fields_added.join(', ')}`, 'info');
    
    return true;
  }

  /**
   * Step 8: Setup external lane (if external_lane_enabled)
   */
  setupExternalLane() {
    if (!this.modeConfig.external_lane_enabled) {
      this.log('External lane disabled for this mode, skipping setup', 'info');
      return true;
    }

    this.log('Setting up external lane configuration...', 'info');

    this.externalLaneConfig = {
      enabled: true,
      type: this.modeConfig.governance_active ? 'integrated' : 'lattice-overlay',
      claim_limit: this.modeConfig.claim_limit,
      lanes: this.manifest?.integration?.verification_lanes || {
        L_lane: 'implementation',
        R_lane: 'review',
        external_lane: 'human-validation'
      }
    };

    this.log(`External lane type: ${this.externalLaneConfig.type}`, 'success');
    this.log(`Claim limit: ${this.externalLaneConfig.claim_limit}`, 'success');
    
if (this.modeConfig.claim_limit === 'annotation-only') {
            this.log('>> Claims will be annotated, not enforced', 'info');
            this.log('>> External verifier responsible for validation', 'info');
        }

    return true;
  }

  /**
   * Execute full resolution sequence
   */
async resolve() {
        this.log('\n' + '='.repeat(60), 'header');
        this.log('GOVERNANCE RESOLUTION - THREE MODE ARCHITECTURE', 'header');
        this.log('='.repeat(60) + '\n', 'header');

        // ---------------------------------------------------------------------
        // RECOVERY VERIFICATION (CRITICAL SAFETY CHECK)
        // ---------------------------------------------------------------------
        // Before any governance logic runs, we verify that this SwarmMind session
        // is a trusted reconstruction of a previously anchored lane.
        //
        // The verify_recovery.sh script performs three checks:
        //   1. Fingerprint equality between RUNTIME_STATE.json and PHENOTYPE_REGISTRY.json
        //   2. Presence of valid lineage metadata (parent session ID + origin handoff)
        //   3. Basic phenotype health
        //
        // Exit codes:
        //   0 - SAME_PHENOTYPE (all good)
        //   2 - RECONSTRUCTED_UNTRUSTED (lineage missing)
        //   4 - ABORT (fingerprint mismatch)
        //
        // Any non-zero code aborts the resolver - the lane cannot safely assume
        // governance authority without verification.
        // ---------------------------------------------------------------------
        
        const { execSync } = require('child_process');
        const verifyScript = path.join(this.projectRoot, 'verify_recovery.sh');
        
        // Check if verification script exists
        if (fs.existsSync(verifyScript)) {
            this.log('\nStep 0: Running recovery verification...', 'info');
try {
            execSync(`bash "${verifyScript}"`, { stdio: 'pipe', timeout: 30000 });
            this.log('SAME_PHENOTYPE: Verification passed', 'success');
        } catch (error) {
            const code = error.status || 1;
            
            // ALL verification failures trigger state transition
            // No soft warnings - every failure enters quarantine
            this.resolutionStatus = code === 2 ? 'RECONSTRUCTED_UNTRUSTED' :
                                    code === 4 ? 'QUARANTINE_FINGERPRINT_MISMATCH' :
                                    'QUARANTINE_UNKNOWN';
            
            return this.enterQuarantine(code);
        }
} else {
        this.log('WARNING: verify_recovery.sh not found', 'warning');
        this.log('>> Fresh installation or incomplete setup', 'warning');
    }

    this.log('');

    // Step 1: Detect manifest
        this.log('Step 1: Detecting governance manifest...', 'info');
    if (!this.detectManifest()) {
      return this.emitResult();
    }

    // Step 2: Determine mode
    this.log('\nStep 2: Determining runtime mode...', 'info');
    this.determineMode();
        this.log(`\n> ACTIVE MODE: ${this.activeMode}`, 'mode');
    this.log(`  Governance Active: ${this.modeConfig.governance_active}`, 'info');
    this.log(`  External Lane: ${this.modeConfig.external_lane_enabled}`, 'info');
    this.log(`  Claim Limit: ${this.modeConfig.claim_limit}`, 'info');

    // Step 3: Resolve parent (conditional)
    this.log('\nStep 3: Resolving parent governance root...', 'info');
    if (!this.resolveParentGovernance()) {
      return this.emitResult();
    }

    // Step 4: Verify bootstrap (conditional)
    this.log('\nStep 4: Verifying bootstrap path...', 'info');
    if (!this.verifyBootstrap()) {
      return this.emitResult();
    }

    // Step 5: Load governance context (conditional)
    this.log('\nStep 5: Loading governance context...', 'info');
    this.loadGovernanceContext();

    // Step 6: Register project relationship (conditional)
    this.log('\nStep 6: Registering project relationship...', 'info');
    this.registerProjectRelationship();

    // Step 7: Expose extension hooks (conditional)
    this.log('\nStep 7: Exposing extension hooks...', 'info');
    this.exposeExtensionHooks();

    // Step 8: Setup external lane (conditional)
    this.log('\nStep 8: Setting up external lane...', 'info');
    this.setupExternalLane();

    this.resolutionStatus = 'resolved';
    return this.emitResult();
  }

  /**
   * Emit final result
   */
  emitResult() {
    this.log('\n' + '='.repeat(60), 'header');
    this.log('RESOLUTION RESULT', 'header');
    this.log('='.repeat(60), 'header');

    const result = {
      status: this.resolutionStatus,
      project: this.manifest?.project?.name || 'SwarmMind',
      mode: this.activeMode,
      mode_config: this.modeConfig,
      governance: null,
      external_lane: this.externalLaneConfig,
      timestamp: new Date().toISOString()
    };

    if (this.resolutionStatus === 'resolved' || this.resolutionStatus === 'isolated') {
      if (this.modeConfig.governance_active && this.manifest) {
        result.governance = {
          parent: this.manifest.governance.inherits_from,
          bootstrap: this.manifest.governance.bootstrap_path,
          relationship: this.manifest.governance.relationship,
          role: this.manifest.governance.role,
          extension_mode: this.manifest.integration.governance_extension.mode
        };
      }

      this.log(`\n✓ Status: ${this.resolutionStatus.toUpperCase()}`, 'success');
      this.log(`  Mode: ${this.activeMode}`, 'info');
      this.log(`  Governance Active: ${this.modeConfig.governance_active}`, 'info');
      this.log(`  External Lane: ${this.modeConfig.external_lane_enabled}`, 'info');
      this.log(`  Claim Limit: ${this.modeConfig.claim_limit}`, 'info');

      if (result.governance) {
        this.log('\n  Governance Context:', 'info');
        this.log(`    Parent: ${result.governance.parent}`, 'info');
        this.log(`    Bootstrap: ${result.governance.bootstrap}`, 'info');
        this.log(`    Relationship: ${result.governance.relationship}`, 'info');
        this.log(`    Role: ${result.governance.role}`, 'info');
      }

      if (result.external_lane) {
        this.log('\n  External Lane:', 'info');
        this.log(`    Type: ${result.external_lane.type}`, 'info');
        this.log(`    Claim Limit: ${result.external_lane.claim_limit}`, 'info');
      }

    } else {
      this.log(`\n✗ Status: RESOLUTION FAILED`, 'error');
      this.log(`  Reason: ${this.resolutionStatus}`, 'error');
    }

    this.log('\n' + '='.repeat(60) + '\n', 'reset');

    // Write resolution result to JSON
    const resultPath = path.join(this.projectRoot, 'GOVERNANCE_RESOLUTION.json');
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
    this.log(`Resolution result written to: ${resultPath}`, 'info');

    return result;
  }
}

// CLI execution
if (require.main === module) {
    const resolver = new GovernanceResolver(process.cwd());
    
    // Check for existing quarantine state
    const quarantinePath = path.join(process.cwd(), 'QUARANTINE_STATE.json');
    
    if (fs.existsSync(quarantinePath)) {
        console.log('\n[!] QUARANTINE STATE DETECTED');
        console.log('[i] Running re-verification before resumption...\n');
        
        try {
            const quarantineState = JSON.parse(fs.readFileSync(quarantinePath, 'utf8'));
            console.log(`[i] Quarantine reason: ${quarantineState.reason}`);
            console.log(`[i] Timestamp: ${quarantineState.timestamp}\n`);
        } catch (e) {
            console.log('[!] Could not parse quarantine state\n');
        }
        
        // Run verification
        const { execSync } = require('child_process');
        const verifyScript = path.join(process.cwd(), 'verify_recovery.sh');
        
        if (!fs.existsSync(verifyScript)) {
            console.log('[-] ERROR: verify_recovery.sh not found');
            console.log('[-] Cannot exit quarantine without verification');
            process.exit(1);
        }
        
        try {
            execSync(`bash "${verifyScript}"`, { stdio: 'inherit', timeout: 30000 });
            
            // Verification passed - clear quarantine
            console.log('\n[+] VERIFICATION PASSED');
            console.log('[+] Clearing quarantine state...\n');
            
            fs.unlinkSync(quarantinePath);
            console.log('[+] Quarantine cleared');
            console.log('[+] Proceeding with normal resolution...\n');
            
            // Now run normal resolution
            resolver.resolve().then(result => {
                process.exit(result.status === 'resolved' || result.status === 'isolated' ? 0 : 1);
            });
            
        } catch (error) {
            const code = error.status || 1;
            
            // Verification failed - remain quarantined
            console.log('\n[-] VERIFICATION FAILED');
            console.log(`[-] Exit code: ${code}`);
            console.log('[-] System remains quarantined');
            console.log('[-] No resumption possible until verification passes\n');
            process.exit(1);
        }
        
    } else {
        // No quarantine - normal execution
        resolver.resolve().then(result => {
            process.exit(result.status === 'resolved' || result.status === 'isolated' ? 0 : 1);
        });
    }
}

module.exports = GovernanceResolver;
