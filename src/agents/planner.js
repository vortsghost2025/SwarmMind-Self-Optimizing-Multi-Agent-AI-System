const { Agent } = require('../core/agent');

class PlannerAgent extends Agent {
  constructor(id = 'planner-001', laneGate = null) {
    super(id, 'Planner', 'planner', 1000, laneGate);
  }

  async processTask(task) {
    // Simulate planning work
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const plan = {
      goal: task.goal,
      steps: [
        { id: 1, description: 'Analyze requirements', estimatedTime: '5m' },
        { id: 2, description: 'Design solution architecture', estimatedTime: '10m' },
        { id: 3, description: 'Create implementation plan', estimatedTime: '5m' }
      ],
      estimatedTotalTime: '20m',
      resourcesNeeded: ['coder', 'reviewer']
    };
    
    return plan;
  }
}

module.exports = { PlannerAgent };