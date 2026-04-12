class ScalingManager {
  constructor() {
    this.agentPools = {
      planner: [],
      coder: [],
      reviewer: [],
      executor: []
    };
    this.activeAgents = new Map();
    this.taskQueue = [];
    this.processingQueue = false;
    this.scalingThresholds = {
      planner: { min: 1, max: 3, queueThreshold: 2 },
      coder: { min: 1, max: 5, queueThreshold: 3 },
      reviewer: { min: 1, max: 3, queueThreshold: 2 },
      executor: { min: 1, max: 4, queueThreshold: 2 }
    };
  }

  /**
   * Add a task to the queue for processing
   * @param {Object} task - The task to process
   * @param {string} role - The role that should process this task
   */
  enqueueTask(task, role) {
    this.taskQueue.push({ task, role, timestamp: Date.now() });
    // Start processing if not already running
    if (!this.processingQueue) {
      this.processTaskQueue();
    }
    return this.taskQueue.length;
  }

  /**
   * Process tasks from the queue using available agents.
   * The guard flag is set synchronously before any await to prevent concurrent
   * entries when multiple callers evaluate !this.processingQueue simultaneously.
   */
  async processTaskQueue() {
    // Synchronous guard: set immediately so no other synchronous caller enters
    if (this.processingQueue || this.taskQueue.length === 0) {
      return;
    }
    this.processingQueue = true;

    const MAX_RETRIES = 10;
    let retries = 0;

    while (this.taskQueue.length > 0) {
      const taskItem = this.taskQueue.shift();
      const { task, role } = taskItem;

      // Try to get an available agent for this role
      const availableAgent = this.getAvailableAgent(role);

      if (availableAgent) {
        retries = 0; // reset retry counter on successful dispatch
        // Execute the task with the available agent
        try {
          await availableAgent.execute(task);
        } catch (error) {
          console.error(`Task execution failed for agent ${availableAgent.id}:`, error);
        }
      } else {
        // No available agent — put task back and try to scale up
        this.taskQueue.unshift(taskItem);

        // Attempt to scale up for this role
        const scaleResult = await this.scaleIfNeeded(role);
        if (scaleResult.action === 'noChange') {
          retries += 1;
          if (retries >= MAX_RETRIES) {
            console.error(
              `processTaskQueue: no agent available for role "${role}" after ${MAX_RETRIES} retries. ` +
              'Aborting queue processing to prevent busy-wait.'
            );
            break;
          }
          // Brief back-off before retrying
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    this.processingQueue = false;
  }

  getAgentPool(role) {
    return this.agentPools[role] || [];
  }

  getAvailableAgent(role) {
    const pool = this.getAgentPool(role);
    return pool.find(agent => agent.status === 'idle' || agent.status === 'completed');
  }

  createAgent(role, idOverride) {
    let AgentClass;
    switch (role) {
      case 'planner':
        AgentClass = require('../agents/planner').PlannerAgent;
        break;
      case 'coder':
        AgentClass = require('../agents/coder').CoderAgent;
        break;
      case 'reviewer':
        AgentClass = require('../agents/reviewer').ReviewerAgent;
        break;
      case 'executor':
        AgentClass = require('../agents/executor').ExecutorAgent;
        break;
      default:
        throw new Error(`Unknown agent role: ${role}`);
    }

    const agentId = idOverride || `${role}-${Date.now()}-${this.agentPools[role].length}`;

    // Guard against duplicate IDs which would silently corrupt the active-agents map
    if (this.activeAgents.has(agentId)) {
      throw new Error(`Agent with ID "${agentId}" already exists. IDs must be unique.`);
    }

    const newAgent = new AgentClass(agentId);

    this.agentPools[role].push(newAgent);
    this.activeAgents.set(newAgent.id, newAgent);

    return newAgent;
  }

  shouldScaleUp(role) {
    const pool = this.getAgentPool(role);
    const activeCount = pool.filter(agent => agent.status === 'working').length;
    const idleCount = pool.filter(agent => agent.status === 'idle' || agent.status === 'completed').length;
    const { max, queueThreshold } = this.scalingThresholds[role] || { max: 3, queueThreshold: 2 };
    
    // Scale up if we have active work and not enough idle agents
    return (activeCount > 0 && idleCount < queueThreshold && pool.length < max);
  }

  shouldScaleDown(role) {
    const pool = this.getAgentPool(role);
    const idleCount = pool.filter(agent => agent.status === 'idle' || agent.status === 'completed').length;
    const { min } = this.scalingThresholds[role] || { min: 1 };
    
    // Scale down if we have too many idle agents
    return idleCount > min && pool.length > min;
  }

  async scaleIfNeeded(role) {
    if (this.shouldScaleUp(role)) {
      return this.createAgent(role);
    }
    
    if (this.shouldScaleDown(role)) {
      const pool = this.getAgentPool(role);
      const idleAgent = pool.find(agent => agent.status === 'idle' || agent.status === 'completed');
      if (idleAgent) {
        const index = pool.indexOf(idleAgent);
        if (index > -1) {
          pool.splice(index, 1);
          this.activeAgents.delete(idleAgent.id);
          return { action: 'scaledDown', agentId: idleAgent.id };
        }
      }
    }
    
    return { action: 'noChange' };
  }

  getSystemStatus() {
    const status = {
      totalAgents: 0,
      activeAgents: 0,
      idleAgents: 0,
      byRole: {}
    };

    Object.keys(this.agentPools).forEach(role => {
      const pool = this.agentPools[role];
      const active = pool.filter(agent => agent.status === 'working').length;
      const idle = pool.filter(agent => agent.status === 'idle' || agent.status === 'completed').length;
      const error = pool.filter(agent => agent.status === 'error').length;
      
      status.byRole[role] = { total: pool.length, active, idle, error };
      status.totalAgents += pool.length;
      status.activeAgents += active;
      status.idleAgents += idle;
    });

    return status;
  }
}

module.exports = ScalingManager;