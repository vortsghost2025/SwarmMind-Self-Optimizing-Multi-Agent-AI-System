class Agent {
  constructor(id, name, role, maxTraceLength = 1000, laneGate = null) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.status = 'idle';
    this.currentTask = null;
    this.trace = [];
    this.maxTraceLength = maxTraceLength;
    this.laneGate = laneGate; // Phase 2: lane-context gate
  }

  /**
   * Validate task input to prevent potential security issues
   * @param {Object} task - The task to validate
   * @returns {boolean} - True if task is valid
   */
  validateTask(task) {
    if (!task || typeof task !== 'object') {
      return false;
    }
    
    // Check for dangerous properties that could lead to code injection
    const dangerousKeys = ['constructor', '__proto__', 'prototype'];
    for (const key of dangerousKeys) {
      if (task.hasOwnProperty(key)) {
        return false;
      }
    }
    
    // Validate string fields for length and content
    if (task.goal && (typeof task.goal !== 'string' || task.goal.length > 1000)) {
      return false;
    }
    
    if (task.description && (typeof task.description !== 'string' || task.description.length > 1000)) {
      return false;
    }
    
    return true;
  }

  logTrace(action, details = {}) {
    // Prevent trace array from growing indefinitely
    if (this.trace.length >= this.maxTraceLength) {
      // Remove oldest traces to make room for new ones
      const excess = this.trace.length - this.maxTraceLength + 1;
      this.trace.splice(0, excess);
    }
    
    const timestamp = new Date().toISOString();
    const traceEntry = {
      timestamp,
      agentId: this.id,
      agentName: this.name,
      action,
      details
    };
    this.trace.push(traceEntry);
    return traceEntry;
  }

  async execute(task) {
    // Validate task input
    if (!this.validateTask(task)) {
      const error = new Error('Invalid task input');
      this.logTrace('task_error', { error: error.message });
      this.status = 'error';
      throw error;
    }
    
    this.status = 'working';
    this.currentTask = task;
    this.logTrace('task_start', { task });
    
    try {
      const result = await this.processTask(task);
      this.logTrace('task_complete', { result });
      this.status = 'completed';
      return result;
    } catch (error) {
      this.logTrace('task_error', { error: error.message });
      this.status = 'error';
      throw error;
    } finally {
      this.currentTask = null;
    }
  }

  // To be implemented by subclasses
  async processTask(task) {
    throw new Error('processTask method must be implemented by subclass');
  }

  getTrace() {
    return [...this.trace];
  }

  clearTrace() {
    this.trace = [];
  }
}

module.exports = { Agent };