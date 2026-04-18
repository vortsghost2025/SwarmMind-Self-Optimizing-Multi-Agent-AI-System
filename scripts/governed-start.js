#!/usr/bin/env node
/**
 * GOVERNANCE-AWARE STARTUP
 * 
 * Purpose: Launch SwarmMind with governance context loaded
 * 
 * This script wraps the normal app.js startup to:
 * 1. Run governance resolver first
 * 2. Inject governance context into app
 * 3. Continue with normal SwarmMind execution
 * 
 * Phase 2.5: Enforces NODE_OPTIONS to prevent child-process bypass of LaneContextGate.
 * All child processes spawned from this environment will automatically require
 * the gate, ensuring lattice enforcement extends beyond the parent process.
 * 
 * Usage: node scripts/governed-start.js
 */

const GovernanceResolver = require('./resolve-governance');
const { LaneContextGate } = require('../src/core/laneContextGate');
const path = require('path');
const fs = require('fs');

class GovernedStartup {
  constructor() {
    this.resolver = new GovernanceResolver(process.cwd());
    this.governanceContext = null;
    this.laneGate = null;
  }

  async start() {
    console.log('\n🚀 SwarmMind Governance-Aware Startup\n');
    console.log('='.repeat(60));

    // Step 0: Initialize Lane-Context Gate (Phase 2: enforce cross-lane write policy)
    console.log('\n🔒 Phase 2: Lane-Context Gate Initialization\n');
    this.laneGate = new (require('../src/core/laneContextGate').LaneContextGate)(process.cwd(), {
      governanceRoot: 'S:\\Archivist-Agent'
    });

    if (!this.laneGate.initialize()) {
      console.error('\n❌ Lane-context gate failed to initialize');
      console.error('   System cannot guarantee lane isolation');
      console.error('   Aborting startup — operator intervention required\n');
      process.exit(1);
    }

    // Install global fs hooks — ALL file writes now pass through gate
    this.laneGate.patchFs();

    if (this.laneGate.isOnHold()) {
      console.error('\n❌ System in HOLD state — lane-context conflict detected');
      console.error('   Operator resolution required before startup\n');
      process.exit(1);
    }

    console.log('\n✅ Lane-context gate active — enforcing cross-lane write policy\n');

    // Step 0.5: Phase 2.5 — Enforce NODE_OPTIONS for child process propagation
    console.log('\n🛡️  Phase 2.5: Child-Process Lattice Enforcement\n');
    this.enforceNodeOptions();

    // Step 0.75: Phase 3.7 — Continuity verification (fingerprint + recovery classifier)
    console.log('\n🔐 Phase 3.7: Continuity Verification\n');
    const { ContinuityVerifier } = require('../src/resilience/ContinuityVerifier');
    const continuity = new ContinuityVerifier({
      gate: this.laneGate,
      projectRoot: process.cwd()
    });
    const continuityResult = continuity.verify();
    console.log(`   Action: ${continuityResult.action}`);
    if (continuityResult.action === 'QUARANTINE' || continuityResult.action === 'LANE_DEGRADATION') {
      console.error('\n❌ Continuity check failed — system cannot start');
      console.error(`   Reason: ${continuityResult.details.reason}\n`);
      process.exit(1);
    }
    if (continuityResult.action === 'DRIFT_DETECTED') {
      console.warn(`   ⚠️  Codebase drift detected: ${continuityResult.details.reason}`);
      console.warn('   Operator review recommended but startup continuing\n');
    }
    if (continuityResult.action === 'REVIEW_NEEDED') {
      console.warn(`   ⚠️  Recovery review needed: ${continuityResult.details.reason}`);
      console.warn('   Continue with caution\n');
    }
    console.log('✅ Continuity verification complete\n');

    // Step 1: Create resolver with lane-gate injected
    console.log('\n📋 Phase 1: Governance Resolution\n');
    this.resolver = new GovernanceResolver(process.cwd(), { laneGate: this.laneGate });
    const resolution = await this.resolver.resolve();

    // Step 2: Handle resolution result
    if (resolution.status === 'resolved') {
      console.log('\n✅ Governance context loaded successfully');
      console.log('   SwarmMind is now operating within governance framework');
      this.governanceContext = resolution.governance;
    } else if (resolution.status === 'isolated') {
      console.log('\n⚠️  Operating in isolated mode');
      console.log('   No parent governance detected');
      console.log('   Running as standalone demo');
    } else {
      console.log('\n❌ Governance resolution failed');
      console.log(`   Status: ${resolution.status}`);
      console.log('   Proceeding with fallback mode...\n');
    }

    // Step 3: Load and execute main app
    console.log('\n📋 Phase 2: SwarmMind Execution\n');
    console.log('='.repeat(60) + '\n');

    try {
      // Dynamically require the main app
      const appPath = path.join(process.cwd(), 'src', 'app.js');
      
      if (fs.existsSync(appPath)) {
        // Import and run
        const SwarmMindApp = require(appPath);
        
        // If governance context available, we could inject it
        if (this.governanceContext) {
          console.log('🔗 Governance hooks available:');
          console.log(`   Bootstrap: ${this.governanceContext.bootstrap}`);
          console.log(`   Extension: ${this.governanceContext.extension_mode}`);
          console.log('   (Governance context can be accessed by agents)\n');
        }

        // Run the app (inject lane-gate for cross-lane enforcement)
        const app = new SwarmMindApp(this.laneGate);
        await app.initialize();
        await app.runDemoTask("Create a simple web application that displays 'Hello, SwarmMind!'");
        await app.demonstrateScaling();

        console.log('\n🎉 SwarmMind Demo Complete!');
        console.log('\n💡 Key Features Demonstrated:');
        console.log(' • Agent Swarm Execution (Planner → Coder → Reviewer → Executor)');
        console.log(' • Cognitive Trace Visualization');
        console.log(' • Auto-Scaling Based on Workload');
        console.log(' • Experimentation Engine (Single vs Multi-Agent Comparison)');
        
        if (this.governanceContext) {
          console.log('\n🔒 Governance Context:');
          console.log(` • Inheritance: ${this.governanceContext.parent}`);
          console.log(` • Role: ${this.governanceContext.role}`);
          console.log(` • Extension: ${this.governanceContext.extension_mode}`);
        }

      } else {
        console.error(`App not found at: ${appPath}`);
        process.exit(1);
      }

    } catch (error) {
      console.error('Failed to start SwarmMind:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  }

  /**
   * Phase 2.5: Enforce NODE_OPTIONS to prevent child-process bypass.
   * 
   * Child processes do NOT inherit the parent's fs monkey-patch. We must require
   * the gate in every child via NODE_OPTIONS=--require.
   * 
   * This method:
   * 1. Sets process.env.NODE_OPTIONS to preload laneContextGate.js
   * 2. Warns if NODE_OPTIONS already set (could conflict)
   * 3. Logs enforcement for audit trail
   */
  enforceNodeOptions() {
    const gatePath = path.join(process.cwd(), 'src', 'core', 'laneContextGate.js');
    const requiredOption = `--require ${gatePath}`;
    
    // Check if NODE_OPTIONS already contains our requirement
    const existing = process.env.NODE_OPTIONS || '';
    
    if (existing.includes(requiredOption)) {
      console.log(`[NODE_OPTIONS] Already set correctly`);
      console.log(`  Current: ${existing}`);
      return;
    }
    
    // Warn if NODE_OPTIONS already has any value (could conflict)
    if (existing && !existing.includes('--require')) {
      console.warn('[NODE_OPTIONS] Warning: Existing NODE_OPTIONS will be augmented:');
      console.warn(`  Existing: ${existing}`);
      console.warn(`  Adding:    ${requiredOption}`);
    } else if (existing && existing.includes('--require')) {
      console.warn('[NODE_OPTIONS] Warning: NODE_OPTIONS already has --require flags');
      console.warn(`  Current: ${existing}`);
      console.warn(`  Appending: ${requiredOption}`);
    }
    
    // Set NODE_OPTIONS to include our gate preload
    // We prepend to ensure our gate loads first and can patch fs before other modules
    process.env.NODE_OPTIONS = `${requiredOption} ${existing}`.trim();
    
    console.log('[NODE_OPTIONS] Enforcement active');
    console.log(`  Set: NODE_OPTIONS="${process.env.NODE_OPTIONS}"`);
    console.log('  All child processes spawned from this environment will require the gate.\n');
    
    // Also validate that gate can initialize from NODE_OPTIONS (LaneContextGate.initFromEnv)
    if (typeof this.laneGate.initFromEnv === 'function') {
      const envOk = this.laneGate.initFromEnv();
      if (!envOk) {
        console.warn('[LANE-GATE] Warning: NODE_OPTIONS validation failed — gate may not load in children');
      } else {
        console.log('[LANE-GATE] NODE_OPTIONS validation passed — child processes will enforce gate\n');
      }
    }
  }
}

// Execute
if (require.main === module) {
  const startup = new GovernedStartup();
  startup.start().catch(err => {
    console.error('Startup failed:', err);
    process.exit(1);
  });
}

module.exports = GovernedStartup;
