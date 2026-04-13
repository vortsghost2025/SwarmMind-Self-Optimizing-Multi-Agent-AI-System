const { execSync } = require('child_process');
const fs = require('fs');

const result = {
  passed: false,
  details: '',
  verifyJsPassed: false,
  scriptsPassed: false,
  discrepancies: []
};

try {
  // Test 1: Run the main verify.js script
  const verifyOutput = execSync('node verify.js', { 
    encoding: 'utf8', 
    cwd: process.cwd(),
    timeout: 60000 
  });
  
  const verifyPassed = verifyOutput.includes('verification_passed": true') || 
                    verifyOutput.includes('verification_passed: true') ||
                    verifyOutput.includes('PASS');
                    
  result.verifyJsPassed = verifyPassed;
  
  // Test 2: Run the scripts check
  const scriptsOutput = execSync('node scripts/run-all-checks.js', { 
    encoding: 'utf8', 
    cwd: process.cwd(),
    timeout: 30000 
  });
  
  const scriptsPassed = scriptsOutput.includes('verification_passed": true') ||
                       scriptsOutput.includes('verification_passed: true');
                       
  result.scriptsPassed = scriptsPassed;
  
  // Compare results
  if (verifyPassed !== scriptsPassed) {
    result.discrepancies.push({
      verifyJs: verifyPassed,
      scripts: scriptsPassed,
      mismatch: 'verify.js and scripts give different results'
    });
  }
  
  result.passed = verifyPassed && scriptsPassed;
  result.details = verifyPassed 
    ? 'verify.js and scripts both pass' 
    : 'Discrepancy between verify.js and scripts';

} catch (e) {
  result.details = `Verifier test failed: ${e.message}`;
  result.error = e.message;
}

console.log(JSON.stringify(result, null, 2));