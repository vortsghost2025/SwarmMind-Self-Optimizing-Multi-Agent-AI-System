#!/usr/bin/env node
/**
 * generate-audit-claim.js
 *
 * Evidence-locked audit claim generator.
 * Produces machine-verifiable claim payloads from git evidence + test evidence.
 *
 * Usage examples:
 *   node scripts/generate-audit-claim.js --run-tests
 *   node scripts/generate-audit-claim.js --commit a86cc8b --test-output audit/latest-test-output.txt
 *   node scripts/generate-audit-claim.js --commit HEAD --test-command "node scripts/run-tests.js" --run-tests --out audit/claims/latest.json
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const args = {
    commit: 'HEAD',
    runTests: false,
    testCommand: 'node scripts/run-tests.js',
    testOutputPath: null,
    outPath: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--commit' && argv[i + 1]) {
      args.commit = argv[++i];
    } else if (token === '--run-tests') {
      args.runTests = true;
    } else if (token === '--test-command' && argv[i + 1]) {
      args.testCommand = argv[++i];
    } else if (token === '--test-output' && argv[i + 1]) {
      args.testOutputPath = argv[++i];
    } else if (token === '--out' && argv[i + 1]) {
      args.outPath = argv[++i];
    } else {
      throw new Error(`Unknown or incomplete argument: ${token}`);
    }
  }

  return args;
}

function run(command, cmdArgs, options = {}) {
  const result = spawnSync(command, cmdArgs, {
    encoding: 'utf8',
    ...options,
  });
  return result;
}

function runShell(commandString, cwd) {
  return spawnSync(commandString, {
    cwd,
    shell: true,
    encoding: 'utf8',
  });
}

function requireSuccess(result, context) {
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    const stdout = (result.stdout || '').trim();
    throw new Error(`${context} failed (exit ${result.status}). ${stderr || stdout || 'No output.'}`);
  }
}

function parseTestSummary(output) {
  const summaryMatch = output.match(/(\d+)\s+passed,\s+(\d+)\s+failed,\s+(\d+)\s+total/i);
  if (!summaryMatch) return null;
  return {
    passed: Number(summaryMatch[1]),
    failed: Number(summaryMatch[2]),
    total: Number(summaryMatch[3]),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  const repoRootResult = run('git', ['rev-parse', '--show-toplevel'], { cwd });
  requireSuccess(repoRootResult, 'git rev-parse --show-toplevel');
  const repoRoot = repoRootResult.stdout.trim();
  const repoName = path.basename(repoRoot);

  const commitResult = run('git', ['rev-parse', args.commit], { cwd });
  requireSuccess(commitResult, `git rev-parse ${args.commit}`);
  const commit = commitResult.stdout.trim();

  const gitShowCommand = `git show --stat --oneline ${commit}`;
  const gitShowResult = run('git', ['show', '--stat', '--oneline', commit], { cwd });
  requireSuccess(gitShowResult, gitShowCommand);

  let testOutput = '';
  let testExitCode = null;
  const evidenceCommands = [gitShowCommand];

  if (args.testOutputPath) {
    const resolvedPath = path.resolve(cwd, args.testOutputPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`--test-output path does not exist: ${resolvedPath}`);
    }
    testOutput = fs.readFileSync(resolvedPath, 'utf8');
    evidenceCommands.push(`read ${resolvedPath}`);
  } else {
    // Default to running tests if no explicit output file is provided.
    const shouldRunTests = args.runTests || !args.testOutputPath;
    if (!shouldRunTests) {
      throw new Error('No test evidence provided. Use --run-tests or --test-output.');
    }

    evidenceCommands.push(args.testCommand);
    const testResult = runShell(args.testCommand, cwd);
    testExitCode = testResult.status;
    testOutput = `${testResult.stdout || ''}${testResult.stderr || ''}`;
  }

  const summary = parseTestSummary(testOutput);

  let status = 'blocked';
  let claim = 'insufficient evidence for pass/fail claim';
  if (summary) {
    if (summary.failed === 0) {
      status = 'proven';
      claim = 'All tests passed with generated evidence.';
    } else {
      status = 'conflicted';
      claim = `Test failures detected (${summary.failed}/${summary.total}).`;
    }
  } else if (testExitCode !== null && testExitCode !== 0) {
    status = 'blocked';
    claim = `Test command failed before producing a parseable summary (exit=${testExitCode}).`;
  }

  // Ban freeform all-green claims unless evidence is generated and parseable.
  if (status === 'proven' && (!summary || summary.total === 0)) {
    throw new Error('Refusing all-green claim without parseable test evidence.');
  }

  const timestamp = new Date().toISOString();
  const shortCommit = commit.slice(0, 7);
  const defaultOut = path.join(repoRoot, 'audit', 'claims', `${timestamp.replace(/[:]/g, '-').replace(/\.\d+Z$/, 'Z')}-${shortCommit}.json`);
  const outPath = args.outPath ? path.resolve(cwd, args.outPath) : defaultOut;
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const report = {
    schema_version: '1.1',
    report_type: 'audit_claim',
    repo: repoName,
    commit,
    timestamp,
    status,
    claim,
    evidence_commands: evidenceCommands,
    evidence_results: {
      git_show_stat: gitShowResult.stdout.trim(),
      tests: {
        command: args.testOutputPath ? null : args.testCommand,
        exit_code: testExitCode,
        summary,
        output_excerpt: testOutput.trim().split('\n').slice(-50).join('\n'),
      },
    },
    snapshot_scope: {
      swarm_local_status: 'unknown/not managed here',
      cross_repo_status: 'unproven_without_explicit_probe',
      rule: 'Cross-repo snapshot status must come from an explicit probe, never inference.',
    },
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`Audit claim generated: ${outPath}`);
  console.log(`repo=${report.repo} commit=${report.commit} status=${report.status}`);
  if (summary) {
    console.log(`tests=${summary.passed}/${summary.total} passed`);
  } else {
    console.log('tests=summary not parseable');
  }

  if (testExitCode !== null && testExitCode !== 0) {
    process.exit(testExitCode);
  }
}

try {
  main();
} catch (error) {
  console.error(`[generate-audit-claim] ${error.message}`);
  process.exit(1);
}
