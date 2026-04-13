const ExperimentationEngine = require('../src/core/experimentationEngine');

const result = {
  passed: false,
  details: '',
  output: ''
};

try {
  const engine = new ExperimentationEngine();
  
  const hasRequired = typeof engine.runSingleAgentExperiment === 'function' &&
                  typeof engine.runMultiAgentExperiment === 'function' &&
                  typeof engine.runComparisonExperiment === 'function';
  
  if (hasRequired) {
    result.passed = true;
    result.details = 'ExperimentationEngine instantiates with required methods';
    result.output = JSON.stringify({
      runSingleAgentExperiment: typeof engine.runSingleAgentExperiment,
      runMultiAgentExperiment: typeof engine.runMultiAgentExperiment,
      compareResults: typeof engine.compareResults
    }, null, 2);
  } else {
    result.details = 'ExperimentationEngine missing required methods';
  }
} catch (e) {
  result.details = `Experimentation engine check failed: ${e.message}`;
}

console.log(JSON.stringify(result, null, 2));