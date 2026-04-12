const { Agent } = require('../core/agent');

class ExecutorAgent extends Agent {
  constructor(id = 'executor-001') {
    super(id, 'Executor', 'executor');
  }

  async processTask(task) {
    const memBefore = process.memoryUsage().heapUsed;
    const startTime = Date.now();

    // Simulate execution work
    await new Promise(resolve => setTimeout(resolve, 1200));

    const elapsedMs = Date.now() - startTime;
    const memAfterBytes = process.memoryUsage().heapUsed;
    const memDeltaMB = ((memAfterBytes - memBefore) / 1024 / 1024).toFixed(2);

    const executionResult = {
      status: 'executed',
      output: `Executed task: ${task.goal || task.description || 'Unknown task'}`,
      artifacts: [
        { name: 'output.log', content: 'Task execution completed successfully\n' },
        { name: 'result.txt', content: 'Task result: SUCCESS' }
      ],
      performanceMetrics: {
        executionTimeMs: elapsedMs,
        memoryDeltaMB: Number(memDeltaMB),
        heapUsedMB: Number((memAfterBytes / 1024 / 1024).toFixed(2))
      }
    };

    return executionResult;
  }
}

module.exports = { ExecutorAgent };