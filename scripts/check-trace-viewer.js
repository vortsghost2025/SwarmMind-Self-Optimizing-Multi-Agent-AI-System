const TV = require('../src/ui/traceViewer');
const CognitiveTraceViewer = TV.CognitiveTraceViewer || TV;

const result = {
  passed: false,
  details: '',
  output: ''
};

try {
  if (typeof CognitiveTraceViewer !== 'function') {
    throw new Error('CognitiveTraceViewer is not a constructor');
  }
  
  const viewer = new CognitiveTraceViewer();
  
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(viewer));
  const hasRequired = methods.includes('registerAgent') && 
                    methods.includes('captureTrace') &&
                    methods.includes('getAllTraces');
  
  if (hasRequired && viewer.traces instanceof Array) {
    result.passed = true;
    result.details = 'CognitiveTraceViewer instantiates with required methods';
    result.output = JSON.stringify({
      methods: methods,
      tracesType: viewer.traces.constructor.name
    }, null, 2);
  } else {
    result.details = 'CognitiveTraceViewer missing required methods';
  }
} catch (e) {
  result.details = `Trace viewer check failed: ${e.message}`;
}

console.log(JSON.stringify(result, null, 2));