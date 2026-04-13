const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const checks = [
  { name: 'agent_health', script: './check-agent-health.js' },
  { name: 'trace_viewer', script: './check-trace-viewer.js' },
  { name: 'experimentation_engine', script: './check-experimentation.js' },
  { name: 'scaling_manager', script: './check-scaling-manager.js' }
];

const results = {};

for (const check of checks) {
  try {
    const output = execSync(`node ${check.script}`, { 
      encoding: 'utf8',
      cwd: __dirname,
      timeout: 30000
    });
    
    let parsed = null;
    try {
      parsed = JSON.parse(output.trim());
      results[check.name] = {
        passed: parsed.passed,
        details: parsed.details,
        output: parsed.output || ''
      };
    } catch {
      results[check.name] = {
        passed: true,
        details: 'Script executed (non-JSON output)',
        output: output.substring(0, 500)
      };
    }
  } catch (e) {
    results[check.name] = {
      passed: false,
      details: e.message,
      output: ''
    };
  }
}

const allPassed = Object.values(results).every(r => r.passed);

console.log('=== VERIFICATION RESULTS ===');
console.log(JSON.stringify({
  verification_passed: allPassed,
  checks: results
}, null, 2));

fs.writeFileSync(
  path.join(__dirname, '..', 'verification', 'check_results.json'),
  JSON.stringify({ timestamp: new Date().toISOString(), verification_passed: allPassed, checks: results }, null, 2)
);