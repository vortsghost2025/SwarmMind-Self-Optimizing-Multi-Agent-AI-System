class Agent {
  constructor(id, name, role) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.status = 'idle';
    this.currentTask = null;
    this.trace = [];
  }

  logTrace(action, details = {}) {
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