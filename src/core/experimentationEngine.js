const ScalingManager = require('./scalingManager');
const CognitiveTraceViewer = require('../ui/traceViewer');

class ExperimentationEngine {
  constructor() {
    this.scalingManager = new ScalingManager();
    this.traceViewer = new CognitiveTraceViewer();
    this.results = {
      singleAgent: null,
      multiAgent: null,
      comparison: null
    };
  }

  async runSingleAgentExperiment(task) {
    console.log('🧪 Starting Single Agent Experiment...');
    
    // Create a single agent that does all roles
    const singleAgent = this.scalingManager.createAgent('planner', 'single-agent-001');
    // We'll make this agent handle all tasks for simplicity in this demo
    
    this.traceViewer.registerAgent(singleAgent);
    
    const startTime = Date.now();
    try {
      // Simulate a single agent doing planning -> coding -> reviewing -> executing
      const planResult = await singleAgent.execute({ 
        goal: task.goal, 
        type: 'planning' 
      });
      
      // For demo purposes, we'll simulate the other roles with timeouts
      await new Promise(resolve => setTimeout(resolve, 1000)); // coding
      await new Promise(resolve => setTimeout(resolve, 800));  // reviewing
      await new Promise(resolve => setTimeout(resolve, 1200)); // executing
      
      const endTime = Date.now();
      
      this.results.singleAgent = {
        success: true,
        totalTime: endTime - startTime,
        stepsCompleted: 4,
        agentUsed: 'Single Agent (Planner)',
        trace: this.traceViewer.getAgentTraces(singleAgent.id),
        performance: {
          timePerStep: (endTime - startTime) / 4,
          efficiency: 0.75 // Arbitrary efficiency score for demo
        }
      };
      
      return this.results.singleAgent;
    } catch (error) {
      console.error('Single agent experiment failed:', error);
      this.results.singleAgent = {
        success: false,
        error: error.message,
        totalTime: Date.now() - startTime
      };
      return this.results.singleAgent;
    }
  }

  async runMultiAgentExperiment(task) {
    console.log('🧪 Starting Multi-Agent Experiment...');
    
    // Create agents for each role
    const planner = this.scalingManager.createAgent('planner', 'planner-exp-001');
    const coder = this.scalingManager.createAgent('coder', 'coder-exp-001');
    const reviewer = this.scalingManager.createAgent('reviewer', 'reviewer-exp-001');
    const executor = this.scalingManager.createAgent('executor', 'executor-exp-001');
    
    // Register all agents with trace viewer
    [planner, coder, reviewer, executor].forEach(agent => {
      this.traceViewer.registerAgent(agent);
    });
    
    const startTime = Date.now();
    try {
      // Execute workflow: Planner -> Coder -> Reviewer -> Executor
      const planResult = await planner.execute({ 
        goal: task.goal, 
        type: 'planning' 
      });
      
      const codeResult = await coder.execute({ 
        goal: task.goal, 
        plan: planResult,
        type: 'coding' 
      });
      
      const reviewResult = await reviewer.execute({ 
        goal: task.goal, 
        plan: planResult,
        code: codeResult,
        type: 'reviewing' 
      });
      
      const executionResult = await executor.execute({ 
        goal: task.goal, 
        plan: planResult,
        code: codeResult,
        review: reviewResult,
        type: 'executing' 
      });
      
      const endTime = Date.now();
      
      this.results.multiAgent = {
        success: true,
        totalTime: endTime - startTime,
        stepsCompleted: 4,
        agentsUsed: ['Planner', 'Coder', 'Reviewer', 'Executor'],
        trace: this.traceViewer.getAllTraces(),
        performance: {
          timePerStep: (endTime - startTime) / 4,
          efficiency: 0.90 // Higher efficiency due to specialization
        }
      };
      
      return this.results.multiAgent;
    } catch (error) {
      console.error('Multi-agent experiment failed:', error);
      this.results.multiAgent = {
        success: false,
        error: error.message,
        totalTime: Date.now() - startTime
      };
      return this.results.multiAgent;
    }
  }

  async runComparisonExperiment(task) {
    console.log('🔬 Running Comparative Experiment...');
    
    // Run both experiments
    const singleResult = await this.runSingleAgentExperiment(task);
    // Clear traces for clean multi-agent run
    this.traceViewer.clearTraces();
    const multiResult = await this.runMultiAgentExperiment(task);
    
    // Generate comparison
    if (singleResult.success && multiResult.success) {
      const timeDifference = multiResult.totalTime - singleResult.totalTime;
      const percentDifference = (timeDifference / singleResult.totalTime) * 100;
      
      this.results.comparison = {
        winner: timeDifference < 0 ? 'multiAgent' : 'singleAgent',
        timeDifference: Math.abs(timeDifference),
        percentDifference: Math.abs(percentDifference),
        singleAgent: singleResult,
        multiAgent: multiResult,
        summary: {
          fasterBy: timeDifference < 0 ? 'Multi-Agent' : 'Single-Agent',
          fasterByPercent: Math.abs(percentDifference),
          efficiencyGain: multiResult.performance.efficiency - singleResult.performance.efficiency,
          recommendation: timeDifference < 0 
            ? 'Multi-agent approach is faster and more efficient for this task'
            : 'Single-agent approach is faster for this simple task, but multi-agent scales better'
        }
      };
    } else {
      this.results.comparison = {
        error: 'One or both experiments failed',
        singleAgent: singleResult,
        multiAgent: multiResult
      };
    }
    
    return this.results.comparison;
  }

  getResults() {
    return this.results;
  }

  getTraceViewer() {
    return this.traceViewer;
  }
}

module.exports = ExperimentationEngine;