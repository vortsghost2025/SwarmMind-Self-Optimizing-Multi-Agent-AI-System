#!/usr/bin/env node
/**
 * GOVERNANCE RESOLVER
 * 
 * Purpose: Bridge SwarmMind's local context to Archivist-Agent's governance context
 * 
 * This script runs BEFORE normal project logic to:
 * 1. Detect governance manifest
 * 2. Resolve parent governance root
 * 3. Load BOOTSTRAP path
 * 4. Register project relationship
 * 5. Expose extension hooks
 * 6. Continue startup
 * 
 * Evidence: CONTEXT_BOUNDARY_FAILURE_2026-04-16.md
 * "Governance is documented as inherited, but not declared as discoverable"
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for output
const COLORS = {
  RESET: '\x1b[0m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',
  BOLD: '\x1b[1m'
};

class GovernanceResolver {
    constructor(projectRoot) {
        this.projectRoot = projectRoot || process.cwd();
        this.manifest = null;
        this.governanceContext = null;
        this.resolutionStatus = 'not_started';
        this.runtimeMode = null; // 'governed-standalone' | 'standalone-lattice' | 'isolated-demo'
        this.modeContract = null; // The active mode's contract
    }

  log(message, level = 'info') {
    const prefix = {
      'info': `${COLORS.BLUE}ℹ${COLORS.RESET}`,
      'success': `${COLORS.GREEN}✓${COLORS.RESET}`,
      'warning': `${COLORS.YELLOW}⚠${COLORS.RESET}`,
      'error': `${COLORS.RED}✗${COLORS.RESET}`,
      'header': `${COLORS.BOLD}${COLORS.CYAN}`,
      'reset': COLORS.RESET
    };
    console.log(`${prefix[level] || ''} ${message}${level === 'header' || level === 'reset' ? '' : COLORS.RESET}`);
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
   * Step 2: Resolve parent governance root
   */
  resolveParentGovernance() {
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
   * Step 3: Verify bootstrap exists
   */
  verifyBootstrap() {
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
   * Step 4: Load governance context
   */
  loadGovernanceContext() {
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
   * Step 5: Register project relationship
   */
  registerProjectRelationship() {
    if (!this.manifest) {
      return false;
    }

    // Verify project is listed in registry
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
        
        // Check relationship type
        if (registryContent.includes('integration-target') && registryContent.includes(projectName)) {
          this.log('  Relationship confirmed: integration-target', 'success');
        } else {
          this.log('  Warning: relationship type not verified in registry', 'warning');
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
   * Step 6: Expose extension hooks
   */
  exposeExtensionHooks() {
    if (!this.manifest) {
      return false;
    }

    const extensionPath = this.manifest.governance.extension_path;
    
    if (!fs.existsSync(extensionPath)) {
      this.log(`Extension path not found: ${extensionPath}`, 'error');
      return false;
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
     * NEW: Determine runtime mode based on CLI flag, env var, or auto-detect
     * Priority: CLI flag > env var > auto-detect
     * 
     * Mode C (standalone-lattice) is activated when:
     * - Parent governance is unavailable BUT external lane is configured
     * - OR explicitly requested via --mode=standalone-lattice
     */
    determineRuntimeMode() {
        if (!this.manifest) {
            this.runtimeMode = 'isolated-demo';
            this.modeContract = {
                description: 'No manifest - isolated demo',
                governance_active: false,
                external_lane_enabled: false,
                claim_limit: 'none'
            };
            this.log('No manifest, defaulting to isolated-demo', 'warning');
            return this.runtimeMode;
        }

        const modes = this.manifest.runtime?.modes || {};
        
        // Priority 1: CLI flag (supports both --mode=value and --mode value)
        let requestedMode = null;
        for (let i = 0; i < process.argv.length; i++) {
            const arg = process.argv[i];
            if (arg.startsWith('--mode=')) {
                requestedMode = arg.substring(7); // --mode=value
                break;
            } else if (arg === '--mode' && process.argv[i + 1]) {
                requestedMode = process.argv[i + 1]; // --mode value
                break;
            }
        }
        
        if (requestedMode && modes[requestedMode]) {
            this.runtimeMode = requestedMode;
            this.modeContract = modes[requestedMode];
            this.log(`Runtime mode set via CLI: ${requestedMode}`, 'success');
            return this.runtimeMode;
        } else if (requestedMode) {
            this.log(`Invalid CLI mode: ${requestedMode}, falling back to auto-detect`, 'warning');
        }

        // Priority 2: Environment variable
        const envMode = process.env.SWARMIND_MODE;
        if (envMode && modes[envMode]) {
            this.runtimeMode = envMode;
            this.modeContract = modes[envMode];
            this.log(`Runtime mode set via SWARMIND_MODE: ${envMode}`, 'success');
            return this.runtimeMode;
        }

        // Priority 3: Auto-detect based on governance availability
        const parentPath = this.manifest.governance?.inherits_from;
        const bootstrapPath = this.manifest.governance?.bootstrap_path;
        
        const parentExists = parentPath && fs.existsSync(parentPath);
        const bootstrapExists = bootstrapPath && fs.existsSync(bootstrapPath);
        const externalLaneConfigured = this.manifest.integration?.verification_lanes?.external_lane;

        if (parentExists && bootstrapExists) {
            // Mode B: Full governance inheritance
            this.runtimeMode = 'governed-standalone';
            this.modeContract = modes['governed-standalone'];
            this.log('Auto-detected: governed-standalone (parent governance available)', 'success');
        } else if (externalLaneConfigured && !parentExists) {
            // Mode C: Standalone lattice - parent unavailable but external lane exists
            this.runtimeMode = 'standalone-lattice';
            this.modeContract = modes['standalone-lattice'];
            this.log('Auto-detected: standalone-lattice (external lane without parent governance)', 'warning');
            this.log(' Governance claims limited to annotation-only', 'warning');
        } else {
            // Mode A: Fully isolated
            this.runtimeMode = 'isolated-demo';
            this.modeContract = modes['isolated-demo'];
            this.log('Auto-detected: isolated-demo (no governance, no external lanes)', 'warning');
        }

        return this.runtimeMode;
    }

    /**
     * Execute full resolution sequence
     */
    async resolve() {
        this.log('\n' + '='.repeat(60), 'header');
        this.log('GOVERNANCE RESOLUTION', 'header');
        this.log('='.repeat(60) + '\n', 'header');

        // Step 1: Detect manifest
        this.log('Step 1: Detecting governance manifest...', 'info');
        if (!this.detectManifest()) {
            // Even without manifest, we need to set a mode
            this.determineRuntimeMode();
            return this.emitResult();
        }

        // Step 2: Determine runtime mode (NEW - replaces implicit mode)
        this.log('\nStep 2: Determining runtime mode...', 'info');
        this.determineRuntimeMode();

        // Step 3: Resolve parent (only if governance_active)
        if (this.modeContract?.governance_active) {
            this.log('\nStep 3: Resolving parent governance root...', 'info');
            if (!this.resolveParentGovernance()) {
                // Parent failed but external lane may still work
                if (this.modeContract?.external_lane_enabled) {
                    this.log('Parent unavailable, falling back to standalone-lattice', 'warning');
                    this.runtimeMode = 'standalone-lattice';
                    this.modeContract = this.manifest.runtime?.modes?.['standalone-lattice'];
                } else {
                    return this.emitResult();
                }
            }
        } else {
            this.log('\nStep 3: Skipping parent resolution (governance inactive)', 'info');
        }

        // Step 4: Verify bootstrap (only if governance_active)
        if (this.modeContract?.governance_active) {
            this.log('\nStep 4: Verifying bootstrap path...', 'info');
            if (!this.verifyBootstrap()) {
                return this.emitResult();
            }
        } else {
            this.log('\nStep 4: Skipping bootstrap verification (governance inactive)', 'info');
        }

        // Step 5: Load governance context (only if governance_active)
        if (this.modeContract?.governance_active) {
            this.log('\nStep 5: Loading governance context...', 'info');
            this.loadGovernanceContext();
        } else {
            this.log('\nStep 5: Skipping governance context load (governance inactive)', 'info');
        }

        // Step 6: Register project relationship (only if governance_active)
        if (this.modeContract?.governance_active) {
            this.log('\nStep 6: Registering project relationship...', 'info');
            this.registerProjectRelationship();
        } else {
            this.log('\nStep 6: Skipping project registration (governance inactive)', 'info');
        }

        // Step 7: Expose extension hooks (if external lane enabled)
        if (this.modeContract?.external_lane_enabled) {
            this.log('\nStep 7: Exposing extension hooks...', 'info');
            this.exposeExtensionHooks();
        } else {
            this.log('\nStep 7: Skipping extension hooks (external lane disabled)', 'info');
        }

        this.resolutionStatus = 'resolved';
        return this.emitResult();
    }

    /**
     * Emit final result - NOW OUTPUTS RUNTIME_STATE FORMAT
     * This file enables cross-lane sync without querying
     */
    emitResult() {
        this.log('\n' + '='.repeat(60), 'header');
        this.log('RESOLUTION RESULT', 'header');
        this.log('='.repeat(60), 'header');

        // Build runtime contract (GPT's RUNTIME_STATE.json format)
        const result = {
            timestamp: new Date().toISOString(),
            project: this.manifest?.project?.name || 'unknown',
            version: this.manifest?.project?.version || '0.0.0',
            
            // Primary resolution fields
            resolved_mode: this.runtimeMode || 'isolated-demo',
            status: this.resolutionStatus,
            
            // Mode contract (what this mode allows)
            governance_active: this.modeContract?.governance_active ?? false,
            external_lane_enabled: this.modeContract?.external_lane_enabled ?? false,
            claim_limit: this.modeContract?.claim_limit || 'none',
            
            // Governance details (only if active)
            governance: null,
            
            // Cross-lane sync fields
            branch: 'main',
            session_id: `${Date.now()}-${process.pid}`,
            
            // Validation results
            validation: {
                manifest_detected: !!this.manifest,
                parent_resolved: this.modeContract?.governance_active ? 
                    (this.governanceContext?.files?.bootstrap?.exists ?? false) : null,
                bootstrap_verified: this.modeContract?.governance_active ?
                    (this.governanceContext?.files?.bootstrap?.exists ?? false) : null,
                extension_available: this.modeContract?.external_lane_enabled ?
                    fs.existsSync(this.manifest?.governance?.extension_path || '') : null
            }
        };

        if (this.modeContract?.governance_active && this.manifest) {
            result.governance = {
                parent: this.manifest.governance.inherits_from,
                bootstrap: this.manifest.governance.bootstrap_path,
                relationship: this.manifest.governance.relationship,
                role: this.manifest.governance.role,
                derivation_chain: this.manifest.governance.derivation_chain,
                extension_mode: this.manifest.integration?.governance_extension?.mode
            };
        }

        // Output summary
        const modeEmoji = {
            'governed-standalone': '🏛️',
            'standalone-lattice': '🔗',
            'isolated-demo': '🔒'
        };

        this.log(`\n${modeEmoji[this.runtimeMode] || '❓'} Mode: ${this.runtimeMode}`, 
            this.runtimeMode === 'governed-standalone' ? 'success' : 'warning');
        this.log(` Governance Active: ${result.governance_active}`, 'info');
        this.log(` External Lane: ${result.external_lane_enabled ? 'ENABLED' : 'DISABLED'}`, 'info');
        this.log(` Claim Limit: ${result.claim_limit}`, 'info');

        if (result.governance) {
            this.log(`\n Governance Source:`, 'header');
            this.log(`   Parent: ${result.governance.parent}`, 'info');
            this.log(`   Bootstrap: ${result.governance.bootstrap}`, 'info');
            this.log(`   Role: ${result.governance.role}`, 'info');
        }

        if (this.resolutionStatus !== 'resolved') {
            this.log(`\n✗ Status: ${this.resolutionStatus.toUpperCase()}`, 'error');
        } else {
            this.log(`\n✓ Status: RESOLVED`, 'success');
        }

        this.log('\n' + '='.repeat(60) + '\n', 'reset');

        // Write GOVERNANCE_RESOLUTION.json (runtime state)
        const resultPath = path.join(this.projectRoot, 'GOVERNANCE_RESOLUTION.json');
        fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
        this.log(`Runtime state written to: ${resultPath}`, 'info');

        // Also write a minimal RUNTIME_STATE.json for cross-lane sync
        const runtimeStatePath = path.join(this.projectRoot, 'RUNTIME_STATE.json');
        const runtimeState = {
            timestamp: result.timestamp,
            mode: result.resolved_mode,
            governance_active: result.governance_active,
            external_lane_enabled: result.external_lane_enabled,
            claim_limit: result.claim_limit,
            branch: result.branch,
            session_id: result.session_id,
            parent: result.governance?.parent || null
        };
        fs.writeFileSync(runtimeStatePath, JSON.stringify(runtimeState, null, 2));
        this.log(`Cross-lane sync file: ${runtimeStatePath}`, 'info');

        return result;
    }
}

// CLI execution
if (require.main === module) {
  const resolver = new GovernanceResolver(process.cwd());
  resolver.resolve().then(result => {
    process.exit(result.status === 'resolved' ? 0 : 1);
  });
}

module.exports = GovernanceResolver;
