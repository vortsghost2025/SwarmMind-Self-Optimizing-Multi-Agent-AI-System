const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const TIMEOUT_MS = 30_000;

const args = process.argv.slice(2);
let filter = null;
let verbose = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--filter' && args[i + 1]) {
    filter = args[++i];
  } else if (args[i] === '--verbose') {
    verbose = true;
  }
}

function discoverTests(dir, prefix) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return files
    .filter(f => f.startsWith('test-') && f.endsWith('.js'))
    .map(f => path.join(dir, f))
    .sort();
}

const scriptTests = discoverTests(SCRIPTS_DIR, 'scripts');
const rootTests = discoverTests(ROOT, 'root');
const allTests = [...rootTests, ...scriptTests];

const tests = filter
  ? allTests.filter(t => path.basename(t).includes(filter))
  : allTests;

if (tests.length === 0) {
  console.log('No test files found.');
  process.exit(0);
}

const passed = [];
const failed = [];
let current = 0;

for (const testFile of tests) {
  current++;
  const label = path.relative(ROOT, testFile);
  process.stdout.write(`[${current}/${tests.length}] ${label} ... `);

  const start = Date.now();
  const result = spawnSync(process.execPath, [testFile], {
    cwd: ROOT,
    timeout: TIMEOUT_MS,
    encoding: 'utf-8',
    env: { ...process.env },
    windowsHide: true,
  });
  const elapsed = Date.now() - start;

  const timedOut = result.status === null && result.error && result.error.killed;
  const status = result.status;

  if (timedOut) {
    console.log(`TIMEOUT (${elapsed}ms)`);
    failed.push({ label, reason: 'timeout' });
  } else if (status === 0) {
    console.log(`PASS (${elapsed}ms)`);
    passed.push(label);
  } else {
    console.log(`FAIL (exit ${status}, ${elapsed}ms)`);
    failed.push({ label, reason: `exit ${status}` });
  }

  if (verbose && result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (verbose && result.stderr) {
    process.stderr.write(result.stderr);
  }
}

console.log('');
console.log('--- Results ---');
for (const label of passed) {
  console.log(`  PASS  ${label}`);
}
for (const { label, reason } of failed) {
  console.log(`  FAIL  ${label}  (${reason})`);
}
console.log('');
console.log(`${passed.length} passed, ${failed.length} failed, ${tests.length} total`);

process.exit(failed.length > 0 ? 1 : 0);
