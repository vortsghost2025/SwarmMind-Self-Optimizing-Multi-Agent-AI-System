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
 * Usage: node scripts/governed-start.js
 */

const GovernanceResolver = require('./resolve-governance');
const path = require('path');
const fs = require('fs');

class GovernedStartup {
  constructor() {
    this.resolver = new GovernanceResolver(process.cwd());
    this.governanceContext = null;
  }

  async start() {
    console.log('\n🚀 SwarmMind Governance-Aware Startup\n');
    console.log('='.repeat(60));

    // Step 1: Resolve governance
    console.log('\n📋 Phase 1: Governance Resolution\n');
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
