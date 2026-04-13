const Agent = require('./core/agent');
const CognitiveTraceViewer = require('./ui/traceViewer');
const ScalingManager = require('./core/scalingManager');
const ExperimentationEngine = require('./core/experimentationEngine');

// Delay helper for readable output (for accessibility/video)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Flush output immediately for accessibility
const log = (...args) => {
  console.log(...args);
  // Small delay after each log for readability
  return delay(600);
};

class SwarmMindApp {
  constructor() {
    this.agents = [];
    this.traceViewer = new CognitiveTraceViewer();
    this.scalingManager = new ScalingManager();
    this.experimentationEngine = new ExperimentationEngine();
    this.isRunning = false;
  }

  async initialize() {
    console.log('🚀 Initializing SwarmMind: Self-Optimizing Multi-Agent AI System');
    await delay(1500);
    
    // Create initial set of agents
    this.createInitialAgents();
    await delay(1500);
    
    // Register agents with trace viewer
    this.agents.forEach(agent => {
      this.traceViewer.registerAgent(agent);
    });
    
    console.log('✅ SwarmMind initialized successfully');
    await delay(1500);
    return this;
  }

  createInitialAgents() {
    // Create one of each agent type to start
    const planner = this.scalingManager.createAgent('planner', 'planner-init-001');
    const coder = this.scalingManager.createAgent('coder', 'coder-init-001');
    const reviewer = this.scalingManager.createAgent('reviewer', 'reviewer-init-001');
    const executor = this.scalingManager.createAgent('executor', 'executor-init-001');
    
    this.agents = [planner, coder, reviewer, executor];
    console.log(`👥 Created ${this.agents.length} initial agents`);
  }

  async runDemoTask(taskDescription) {
    console.log(`\n🎯 Processing Task: ${taskDescription}`);
    console.log('='.repeat(60));
    await delay(2000);
    
    const task = {
      description: taskDescription,
      goal: taskDescription,
      timestamp: new Date().toISOString()
    };
    
    // Run the comparative experiment
    console.log('🔬 Running Comparative Experiment...');
    await delay(1000);
    const results = await this.experimentationEngine.runComparisonExperiment(task);
    
    // Display results
    this.displayResults(results);
    await delay(2000);
    
    // Show cognitive trace
    this.displayCognitiveTrace();
    await delay(1000);
    
    return results;
  }

  async displayResults(results) {
    console.log('\n📊 EXPERIMENT RESULTS');
    console.log('='.repeat(60));
    await delay(1500);
    
    if (results.error) {
      console.log(`❌ Error: ${results.error}`);
      return;
    }
    
    if (results.winner && results.summary) {
      console.log(`🏆 WINNER: ${results.summary.fasterBy}`);
      await delay(1000);
      console.log(`⚡ Speed Advantage: ${results.summary.fasterByPercent.toFixed(1)}%`);
      await delay(500);
      console.log(`📈 Efficiency Gain: ${(results.summary.efficiencyGain * 100).toFixed(1)}%`);
      await delay(500);
      console.log(`💡 Recommendation: ${results.summary.recommendation}`);
      await delay(1500);
      
      console.log('\n📋 DETAILED BREAKDOWN:');
      await delay(500);
      console.log(`   Single Agent: ${results.singleAgent.totalTime}ms (${results.singleAgent.stepsCompleted} steps)`);
      console.log(`   Multi-Agent:  ${results.multiAgent.totalTime}ms (${results.multiAgent.stepsCompleted} steps)`);
      await delay(1000);
    } else {
      console.log('❌ Experiments incomplete or failed');
      console.log('Single Agent:', results.singleAgent);
      console.log('Multi-Agent:', results.multiAgent);
    }
  }

  async displayCognitiveTrace() {
    console.log('\n🧠 COGNITIVE TRACE VIEWER');
    console.log('='.repeat(60));
    await delay(1500);
    
    const traceSummary = this.experimentationEngine.getTraceViewer().getTraceSummary();
    console.log(`📈 Total Trace Events: ${traceSummary.totalTraces}`);
    await delay(800);
    console.log(`👥 Agent Activity:`);
    await delay(500);
    
    Object.keys(traceSummary.agents).forEach(agent => {
      console.log(`   ${agent}: ${traceSummary.agents[agent]} events`);
    });
    await delay(800);
    
    console.log(`\n🔧 Action Types:`);
    await delay(500);
    Object.keys(traceSummary.actions).forEach(action => {
      console.log(`   ${action}: ${traceSummary.actions[action]} events`);
    });
    await delay(1000);
    
    // Show the trace tree
    console.log('\n🌳 TRACE TREE:');
    console.log(this.experimentationEngine.getTraceViewer().renderTraceAsText());
  }

  getSystemStatus() {
    return this.scalingManager.getSystemStatus();
  }

async demonstrateScaling() {
      console.log('\n📈 DEMONSTRATING AUTO-SCALING');
      console.log('='.repeat(60));
      await delay(1500);
      
      const initialStatus = this.getSystemStatus();
      console.log('Initial System Status:');
      await delay(1000);
      console.log(JSON.stringify(initialStatus, null, 2));
      await delay(1500);
      
      // Simulate increased workload by creating more tasks
      console.log('\n🔄 Simulating increased workload...');
      await delay(1500);
      const scalingResults = [];
      for (let i = 0; i < 3; i++) {
        // This would normally trigger scaling logic
        const coderResult = await this.scalingManager.scaleIfNeeded('coder');
        const reviewerResult = await this.scalingManager.scaleIfNeeded('reviewer');
        scalingResults.push({ coder: coderResult, reviewer: reviewerResult });
        
        // Log scaling actions
        if (coderResult.action !== 'noChange') {
          console.log(`   Scaling action - Coder: ${coderResult.action} (${coderResult.agentId || ''})`);
        }
        if (reviewerResult.action !== 'noChange') {
          console.log(`   Scaling action - Reviewer: ${reviewerResult.action} (${reviewerResult.agentId || ''})`);
        }
        await delay(800);
      }
      
      const finalStatus = this.getSystemStatus();
      console.log('\nFinal System Status:');
      await delay(1000);
      console.log(JSON.stringify(finalStatus, null, 2));
      await delay(1500);
      
      console.log('\n📊 Scaling Changes:');
      await delay(500);
      Object.keys(finalStatus.byRole).forEach(role => {
        const initial = initialStatus.byRole[role] || { total: 0 };
        const final = finalStatus.byRole[role];
        const change = final.total - initial.total;
        if (change !== 0) {
          console.log(`   ${role}: ${change > 0 ? '+' : ''}${change} agents`);
        }
      });
      await delay(1000);
    }
}

// Export for use in other modules
module.exports = SwarmMindApp;

// If run directly, start the demo
if (require.main === module) {
  (async () => {
    const app = new SwarmMindApp();
    await app.initialize();
    
    // Run demo task
    await delay(3000); // big pause before task
    await app.runDemoTask("Create a simple web application that displays 'Hello, SwarmMind!'");
    await delay(3000); // big pause before scaling
    
    // Demonstrate scaling
    await app.demonstrateScaling();
    
    console.log('\n🎉 SwarmMind Demo Complete!');
    await delay(1000);
    console.log('💡 Key Features Demonstrated:');
    console.log('   • Agent Swarm Execution (Planner → Coder → Reviewer → Executor)');
    await delay(500);
    console.log('   • Cognitive Trace Visualization');
    await delay(500);
    console.log('   • Auto-Scaling Based on Workload');
    await delay(500);
    console.log('   • Experimentation Engine (Single vs Multi-Agent Comparison)');
  })();
}