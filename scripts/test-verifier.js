const { execSync } = require('child_process');
const fs = require('fs');

const result = {
  passed: false,
  details: '',
  verifyJsPassed: false,
  scriptsPassed: false,
  discrepancies: [],
  command_executed: [],
  raw_output: {}
};

try {
  // Test 1: Run verify.js and check its output file
  execSync('node verify.js', { 
    encoding: 'utf8', 
    cwd: process.cwd(),
    timeout: 60000,
    env: process.env 
  });
  result.command_executed.push('node verify.js');
  
  // Read the JSON file verify.js creates
  const verifyFile = fs.readFileSync('verification/system_check.json', 'utf8');
  const verifyData = JSON.parse(verifyFile);
  result.verifyJsPassed = verifyData.verification_passed === true;
  result.raw_output.verify = verifyData.verification_passed;
  
} catch (e) {
  result.raw_output.verify_error = e.message;
}

try {
  // Test 2: Run scripts check
  execSync('node scripts/run-all-checks.js', { 
    encoding: 'utf8', 
    cwd: process.cwd(),
    timeout: 30000,
    env: process.env 
  });
  result.command_executed.push('node scripts/run-all-checks.js');
  
  // Read the JSON file scripts creates
  const scriptsFile = fs.readFileSync('verification/check_results.json', 'utf8');
  const scriptsData = JSON.parse(scriptsFile);
  result.scriptsPassed = scriptsData.verification_passed === true;
  result.raw_output.scripts = scriptsData.verification_passed;
  
} catch (e) {
  result.raw_output.scripts_error = e.message;
}

// Compare results
if (result.verifyJsPassed !== result.scriptsPassed) {
  result.discrepancies.push({
    verifyJs: result.verifyJsPassed,
    scripts: result.scriptsPassed,
    command: 'verification_passed comparison',
    mismatch: 'Results do not match'
  });
}

// PASS only if both match
result.passed = (result.verifyJsPassed === result.scriptsPassed) && result.discrepancies.length === 0;

result.details = result.passed 
  ? 'verify.js and scripts produce identical results' 
  : 'DISCREPANCY: Results do not match';

console.log(JSON.stringify(result, null, 2));