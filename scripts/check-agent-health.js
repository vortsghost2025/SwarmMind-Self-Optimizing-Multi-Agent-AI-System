const AgentModule = require('../src/core/agent');
const Agent = AgentModule.Agent || AgentModule;

const result = {
  passed: false,
  details: '',
  output: ''
};

try {
  if (typeof Agent !== 'function') {
    throw new Error('Agent is not a constructor function');
  }
  
  const agent = new Agent('test-agent-001', 'TestAgent', 'planner');
  
  if (agent.id === 'test-agent-001' && agent.role === 'planner') {
    result.passed = true;
    result.details = 'Agent class loaded and instantiated successfully';
    result.output = JSON.stringify({
      agentId: agent.id,
      agentName: agent.name,
      agentRole: agent.role,
      agentStatus: agent.status
    }, null, 2);
  } else {
    result.details = 'Agent instantiated but properties incorrect';
  }
} catch (e) {
  result.details = `Agent health check failed: ${e.message}`;
}

console.log(JSON.stringify(result, null, 2));