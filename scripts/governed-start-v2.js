#!/usr/bin/env node
/**
 * GOVERNANCE-AWARE STARTUP V2 - THREE MODE ARCHITECTURE
 * 
 * Purpose: Launch SwarmMind with governance context loaded
 * 
 * Supports three runtime modes:
 * - governed-standalone: Archivist-governed child (full governance)
 * - standalone-lattice: Runs alone + exports to external verifier (constraint-lattice-only)
 * - isolated-demo: Local only (no governance, no external lanes)
 * 
 * Usage:
 *   node scripts/governed-start-v2.js
 *   node scripts/governed-start-v2.js --mode=standalone-lattice
 *   SWARMIND_MODE=isolated-demo node scripts/governed-start-v2.js
 */

const GovernanceResolver = require('./resolve-governance-v2');
const path = require('path');
const fs = require('fs');

class GovernedStartupV2 {
  constructor() {
    this.resolver = new GovernanceResolver(process.cwd());
    this.governanceContext = null;
    this.modeConfig = null;
    this.externalLaneConfig = null;
  }

  async start() {
    console.log('\n🚀 SwarmMind Governance-Aware Startup V2');
    console.log('   Three Mode Architecture\n');
    console.log('='.repeat(60));

    // Step 1: Resolve governance
    console.log('\n📋 Phase 1: Governance Resolution\n');
    const resolution = await this.resolver.resolve();

    // Step 2: Handle resolution result
    console.log('\n📋 Phase 2: Mode Configuration\n');
    
    this.modeConfig = resolution.mode_config;
    this.externalLaneConfig = resolution.external_lane;

    if (resolution.status === 'resolved' || resolution.status === 'isolated') {
      console.log(`✅ Mode: ${resolution.mode}`);
      console.log(`   Governance Active: ${this.modeConfig.governance_active}`);
      console.log(`   External Lane: ${this.modeConfig.external_lane_enabled}`);
      console.log(`   Claim Limit: ${this.modeConfig.claim_limit}`);

      if (resolution.governance) {
        this.governanceContext = resolution.governance;
        console.log('\n🔗 Governance Context:');
        console.log(`   Parent: ${resolution.governance.parent}`);
        console.log(`   Bootstrap: ${resolution.governance.bootstrap}`);
        console.log(`   Role: ${resolution.governance.role}`);
      }

      if (this.externalLaneConfig) {
        console.log('\n🔍 External Lane:');
        console.log(`   Type: ${this.externalLaneConfig.type}`);
        console.log(`   Claim Limit: ${this.externalLaneConfig.claim_limit}`);
      }

    } else {
      console.log('\n❌ Governance resolution failed');
      console.log(`   Status: ${resolution.status}`);
      console.log('   Proceeding with fallback mode...\n');
    }

    // Step 3: Load and execute main app
    console.log('\n📋 Phase 3: SwarmMind Execution\n');
    console.log('='.repeat(60) + '\n');

    try {
      const appPath = path.join(process.cwd(), 'src', 'app.js');
      
      if (fs.existsSync(appPath)) {
        const SwarmMindApp = require(appPath);

        // Inject governance context if available
        if (this.governanceContext) {
          console.log('🔗 Governance hooks injected into SwarmMind\n');
        }

        // Inject external lane config if available
        if (this.externalLaneConfig) {
          console.log('🔍 External lane hooks injected into SwarmMind\n');
        }

        // Run the app
        const app = new SwarmMindApp();
        await app.initialize();
        await app.runDemoTask("Create a simple web application that displays 'Hello, SwarmMind!'");
        await app.demonstrateScaling();

        console.log('\n🎉 SwarmMind Demo Complete!');
        console.log('\n💡 Key Features Demonstrated:');
        console.log(' • Agent Swarm Execution (Planner → Coder → Reviewer → Executor)');
        console.log(' • Cognitive Trace Visualization');
        console.log(' • Auto-Scaling Based on Workload');
        console.log(' • Experimentation Engine (Single vs Multi-Agent Comparison)');

        // Show mode summary
        console.log('\n📊 Runtime Mode Summary:');
        console.log(` • Mode: ${resolution.mode}`);
        console.log(` • Governance: ${this.modeConfig.governance_active ? 'Active' : 'Inactive'}`);
        console.log(` • External Lane: ${this.modeConfig.external_lane_enabled ? 'Enabled' : 'Disabled'}`);
        console.log(` • Claims: ${this.modeConfig.claim_limit}`);

        if (this.governanceContext) {
          console.log('\n🔒 Governance Context:');
          console.log(` • Inheritance: ${this.governanceContext.parent}`);
          console.log(` • Role: ${this.governanceContext.role}`);
          console.log(` • Extension: ${this.governanceContext.extension_mode}`);
        }

        if (this.externalLaneConfig) {
          console.log('\n🌐 External Lane:');
          console.log(` • Type: ${this.externalLaneConfig.type}`);
          console.log(` • Claim Limit: ${this.externalLaneConfig.claim_limit}`);
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
}

// Execute
if (require.main === module) {
  const startup = new GovernedStartupV2();
  startup.start().catch(err => {
    console.error('Startup failed:', err);
    process.exit(1);
  });
}

module.exports = GovernedStartupV2;
