const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const results = {
  timestamp: new Date().toISOString(),
  verifyJsResults: null,
  scriptsResults: null,
  discrepancy: null,
  verification_passed: false,
  checks: {}
};

try {
  // Run verify.js
  const verifyOutput = execSync('node verify.js', { 
    encoding: 'utf8', 
    timeout: 60000 
  });
  
  // Parse verify.js output from system_check.json
  const verifyFile = fs.readFileSync('verification/system_check.json', 'utf8');
  results.verifyJsResults = JSON.parse(verifyFile);
  
} catch (e) {
  results.verifyJsResults = { error: e.message };
}

try {
  // Run scripts check
  const scriptsOutput = execSync('node scripts/run-all-checks.js', { 
    encoding: 'utf8', 
    timeout: 30000 
  });
  
  const scriptsFile = fs.readFileSync('verification/check_results.json', 'utf8');
  results.scriptsResults = JSON.parse(scriptsFile);
  
} catch (e) {
  results.scriptsResults = { error: e.message };
}

// DISCREPANCY CHECK
const verifyPassed = results.verifyJsResults?.verification_passed;
const scriptsPassed = results.scriptsResults?.verification_passed;

if (verifyPassed !== scriptsPassed) {
  results.discrepancy = {
    verifyJs: verifyPassed,
    scripts: scriptsPassed,
    message: 'Results do not match'
  };
}

// Use scripts results as authoritative (they actually test functionality)
results.verification_passed = scriptsPassed === true && !results.discrepancy;

// Collect individual check results from scripts
if (results.scriptsResults?.checks) {
  for (const [name, check] of Object.entries(results.scriptsResults.checks)) {
    results.checks[name] = {
      passed: check.passed,
      command: `node scripts/check-${name.replace('_', '-')}.js`,
      details: check.details,
      raw_output: check.output || ''
    };
  }
}

// Write results
fs.writeFileSync(
  path.join(__dirname, '..', 'verification', 'discrepancy_check.json'),
  JSON.stringify(results, null, 2)
);

console.log('=== DISCREPANCY CHECK RESULTS ===');
console.log(JSON.stringify({
  verification_passed: results.verification_passed,
  discrepancy: results.discrepancy,
  checks_count: Object.keys(results.checks).length
}, null, 2));