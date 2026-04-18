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
    constructor(projectRoot, options = {}) {
        this.projectRoot = projectRoot || process.cwd();
        this.manifest = null;
        this.governanceContext = null;
        this.resolutionStatus = 'not_started';
        this.activeMode = null;
        this.modeConfig = null;
        this.externalLaneConfig = null;
        this.quarantineState = null;
        this.laneGate = options.laneGate || null; // Phase 2: lane-context gate
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
     * Phase 2: Pre-write gate wrapper
     * Checks lane context before writing file
     */
    guardedWriteFile(filePath, data, options = {}) {
        const absPath = path.resolve(filePath);
        
        if (this.laneGate) {
            if (!this.laneGate.preWriteGate(absPath, options)) {
                throw new Error(`Write blocked by lane-context gate: ${absPath}`);
            }
        }
        
        fs.writeFileSync(absPath, data, options);
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
        this.guardedWriteFile(quarantinePath, JSON.stringify(quarantineState, null, 2));
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
            execSync(`bash "${verifyScript}"`, { 
              stdio: 'pipe', 
              timeout: 30000,
              env: process.env 
            });
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

    // Write resolution result to JSON (guarded by lane-context gate)
    const resultPath = path.join(this.projectRoot, 'GOVERNANCE_RESOLUTION.json');
    this.guardedWriteFile(resultPath, JSON.stringify(result, null, 2));
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
            execSync(`bash "${verifyScript}"`, { 
              stdio: 'inherit', 
              timeout: 30000,
              env: process.env 
            });
            
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
