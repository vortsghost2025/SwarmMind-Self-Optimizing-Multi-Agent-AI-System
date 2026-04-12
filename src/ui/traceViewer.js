class CognitiveTraceViewer {
  constructor() {
    this.agents = new Map();
    this.traces = [];
    this.isVisible = false;
    this.traceCounter = 0;
  }

  registerAgent(agent) {
    this.agents.set(agent.id, agent);
    // Store original method before overriding
    agent.__originalLogTrace = agent.logTrace.bind(agent);
    // Override the agent's logTrace method to capture traces
    agent.logTrace = (action, details = {}) => {
      const traceEntry = agent.__originalLogTrace(action, details);
      this.traces.push(traceEntry);
      return traceEntry;
    };
    return this;
  }

  captureTrace(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      const trace = agent.getTrace();
      return trace;
    }
    return [];
  }

  getAgentTraces(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      return agent.getTrace();
    }
    return [];
  }

  getAllTraces() {
    return [...this.traces];
  }

  clearTraces() {
    this.traces = [];
    this.agents.forEach((agent, id) => {
      // Restore original logTrace method if it was overridden
      if (agent.__originalLogTrace) {
        agent.logTrace = agent.__originalLogTrace;
      }
      // Re-override with current viewer's context
      agent.__originalLogTrace = agent.logTrace.bind(agent);
      agent.logTrace = (action, details = {}) => {
        const traceEntry = agent.__originalLogTrace(action, details);
        this.traces.push(traceEntry);
        return traceEntry;
      };
    });
  }

  generateUniqueId() {
    return `trace-${this.traceCounter++}`;
  }

  generateTraceTree() {
    const tree = {
      root: {
        id: 'swarm-root',
        label: 'SwarmMind Execution',
        timestamp: new Date().toISOString(),
        children: []
      }
    };

    // Group traces by agent
    const agentTraces = {};
    this.traces.forEach(trace => {
      if (!agentTraces[trace.agentId]) {
        agentTraces[trace.agentId] = [];
      }
      agentTraces[trace.agentId].push(trace);
    });

    // Build tree structure
    Object.keys(agentTraces).forEach(agentId => {
      const agent = this.agents.get(agentId);
      if (agent) {
        const agentNode = {
          id: `agent-${agentId}`,
          label: `${agent.name} (${agent.role})`,
          timestamp: new Date().toISOString(),
          children: agentTraces[agentId].map(trace => ({
            id: this.generateUniqueId(),
            label: trace.action,
            timestamp: trace.timestamp,
            details: trace.details
          }))
        };
        tree.root.children.push(agentNode);
      }
    });

    return tree;
  }

  renderTraceAsText() {
    const tree = this.generateTraceTree();
    let output = '🧠 SWARM MINDS COGNITIVE TRACE\n';
    output += '='.repeat(50) + '\n\n';

    const formatNode = (node, depth = 0) => {
      const indent = '  '.repeat(depth);
      output += `${indent}🔹 ${node.label}\n`;
      if (node.timestamp) {
        output += `${indent}   ⏰ ${new Date(node.timestamp).toLocaleTimeString()}\n`;
      }
      if (node.details && Object.keys(node.details).length > 0) {
        const detailsStr = JSON.stringify(node.details, null, 2);
        output += `${indent}   📝 ${detailsStr.split('\n').map(l => `${indent}   ${l}`).join('\n')}\n`;
      }
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => formatNode(child, depth + 1));
      }
    };

    formatNode(tree.root);
    return output;
  }

  getTraceSummary() {
    const summary = {
      totalTraces: this.traces.length,
      agents: {},
      actions: {}
    };

    this.traces.forEach(trace => {
      // Count by agent
      if (!summary.agents[trace.agentName]) {
        summary.agents[trace.agentName] = 0;
      }
      summary.agents[trace.agentName]++;

      // Count by action
      if (!summary.actions[trace.action]) {
        summary.actions[trace.action] = 0;
      }
      summary.actions[trace.action]++;
    });

    return summary;
  }
}

module.exports = CognitiveTraceViewer;