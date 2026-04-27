#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const RUNNER = path.join(REPO_ROOT, 'scripts', 'swarm-role-runner.js');

function run(args) {
  return spawnSync('node', [RUNNER, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
}

function testVerificationRole() {
  const r = run(['--role', 'verification', '--json']);
  assert.strictEqual(r.status, 0, `verification role failed: ${r.stderr}`);
  const payload = JSON.parse(r.stdout);
  assert.strictEqual(payload.results[0].role, 'verification');
  assert.ok(payload.results[0].summary);
}

function testExecutionDryRunRole() {
  const r = run(['--role', 'execution', '--json']);
  assert.strictEqual(r.status, 0, `execution role failed: ${r.stderr}`);
  const payload = JSON.parse(r.stdout);
  assert.strictEqual(payload.results[0].role, 'execution');
}

function testInvalidRole() {
  const r = run(['--role', 'bogus']);
  assert.notStrictEqual(r.status, 0, 'invalid role should fail');
}

function main() {
  testVerificationRole();
  testExecutionDryRunRole();
  testInvalidRole();
  console.log('swarm-role-runner tests: PASS');
}

if (require.main === module) main();

