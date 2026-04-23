const ScalingManager = require('../src/core/scalingManager');

const result = {
  passed: false,
  details: '',
  output: ''
};

try {
  const manager = new ScalingManager();
  
  const hasRequired = typeof manager.shouldScaleUp === 'function' &&
                  typeof manager.shouldScaleDown === 'function' &&
                  typeof manager.getSystemStatus === 'function';
  
  const hasPools = manager.agentPools &&
                  manager.agentPools.planner &&
                  manager.agentPools.coder &&
                  manager.agentPools.reviewer &&
                  manager.agentPools.executor;
  
  if (hasRequired && hasPools) {
    result.passed = true;
    result.details = 'ScalingManager instantiates with required methods and pools';
    result.output = JSON.stringify({
      shouldScaleUp: typeof manager.shouldScaleUp,
      shouldScaleDown: typeof manager.shouldScaleDown,
      getSystemStatus: typeof manager.getSystemStatus,
      pools: Object.keys(manager.agentPools)
    }, null, 2);
  } else {
    result.details = 'ScalingManager missing required methods or pools';
  }
} catch (e) {
  result.details = `Scaling manager check failed: ${e.message}`;
}

console.log(JSON.stringify(result, null, 2));