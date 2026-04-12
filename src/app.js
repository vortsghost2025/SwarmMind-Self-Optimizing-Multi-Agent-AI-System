const CognitiveTraceViewer = require('./ui/traceViewer');
const ScalingManager = require('./core/scalingManager');
const ExperimentationEngine = require('./core/experimentationEngine');

class SwarmMindApp {
  constructor() {
    this.agents = [];
    this.traceViewer = new CognitiveTraceViewer();
    this.scalingManager = new ScalingManager();
    this.experimentationEngine = new ExperimentationEngine();
    this.isRunning = false;
  }

  initialize() {
    console.log('🚀 Initializing SwarmMind: Self-Optimizing Multi-Agent AI System');
    
    // Create initial set of agents
    this.createInitialAgents();
    
    // Register agents with trace viewer
    this.agents.forEach(agent => {
      this.traceViewer.registerAgent(agent);
    });
    
    console.log('✅ SwarmMind initialized successfully');
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
    
    const task = {
      description: taskDescription,
      goal: taskDescription,
      timestamp: new Date().toISOString()
    };
    
    // Run the comparative experiment
    const results = await this.experimentationEngine.runComparisonExperiment(task);
    
    // Display results
    this.displayResults(results);
    
    // Show cognitive trace
    this.displayCognitiveTrace();
    
    return results;
  }

  displayResults(results) {
    console.log('\n📊 EXPERIMENT RESULTS');
    console.log('='.repeat(60));
    
    if (results.error) {
      console.log(`❌ Error: ${results.error}`);
      return;
    }
    
    if (results.winner && results.summary) {
      console.log(`🏆 WINNER: ${results.summary.fasterBy}`);
      console.log(`⚡ Speed Advantage: ${results.summary.fasterByPercent.toFixed(1)}%`);
      console.log(`📈 Efficiency Gain: ${(results.summary.efficiencyGain * 100).toFixed(1)}%`);
      console.log(`💡 Recommendation: ${results.summary.recommendation}`);
      
      console.log('\n📋 DETAILED BREAKDOWN:');
      console.log(`   Single Agent: ${results.singleAgent.totalTime}ms (${results.singleAgent.stepsCompleted} steps)`);
      console.log(`   Multi-Agent:  ${results.multiAgent.totalTime}ms (${results.multiAgent.stepsCompleted} steps)`);
    } else {
      console.log('❌ Experiments incomplete or failed');
      console.log('Single Agent:', results.singleAgent);
      console.log('Multi-Agent:', results.multiAgent);
    }
  }

  displayCognitiveTrace() {
    console.log('\n🧠 COGNITIVE TRACE VIEWER');
    console.log('='.repeat(60));
    
    const traceSummary = this.experimentationEngine.getTraceViewer().getTraceSummary();
    console.log(`📈 Total Trace Events: ${traceSummary.totalTraces}`);
    console.log(`👥 Agent Activity:`);
    
    Object.keys(traceSummary.agents).forEach(agent => {
      console.log(`   ${agent}: ${traceSummary.agents[agent]} events`);
    });
    
    console.log(`\n🔧 Action Types:`);
    Object.keys(traceSummary.actions).forEach(action => {
      console.log(`   ${action}: ${traceSummary.actions[action]} events`);
    });
    
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
     
     const initialStatus = this.getSystemStatus();
     console.log('Initial System Status:');
     console.log(JSON.stringify(initialStatus, null, 2));
     
     // Simulate increased workload by creating more tasks
     console.log('\n🔄 Simulating increased workload...');
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
     }
     
     const finalStatus = this.getSystemStatus();
     console.log('\nFinal System Status:');
     console.log(JSON.stringify(finalStatus, null, 2));
     
     console.log('\n📊 Scaling Changes:');
     Object.keys(finalStatus.byRole).forEach(role => {
       const initial = initialStatus.byRole[role] || { total: 0 };
       const final = finalStatus.byRole[role];
       const change = final.total - initial.total;
       if (change !== 0) {
         console.log(`   ${role}: ${change > 0 ? '+' : ''}${change} agents`);
       }
     });
   }
}

// Export for use in other modules
module.exports = SwarmMindApp;

// If run directly, start the demo
if (require.main === module) {
  const app = new SwarmMindApp();
  app.initialize();
  
  // Run demo task
  app.runDemoTask("Create a simple web application that displays 'Hello, SwarmMind!'")
    .then(() => {
      // Demonstrate scaling
      return app.demonstrateScaling();
    })
    .then(() => {
      console.log('\n🎉 SwarmMind Demo Complete!');
      console.log('💡 Key Features Demonstrated:');
      console.log('   • Agent Swarm Execution (Planner → Coder → Reviewer → Executor)');
      console.log('   • Cognitive Trace Visualization');
      console.log('   • Auto-Scaling Based on Workload');
      console.log('   • Experimentation Engine (Single vs Multi-Agent Comparison)');
    })
    .catch(error => {
      console.error('❌ Demo failed:', error);
    });
}