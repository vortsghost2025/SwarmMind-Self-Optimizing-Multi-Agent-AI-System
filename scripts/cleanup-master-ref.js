const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repo = 'S:/SwarmMind';
const log = [];

log.push('=== Step 1: Delete stale master ref ===');
try { fs.unlinkSync(path.join(repo, '.git/refs/remotes/origin/master')); log.push('deleted ref'); }
catch(e) { log.push('ref already gone: ' + e.code); }

log.push('\n=== Step 2: Delete master reflog ===');
try { fs.unlinkSync(path.join(repo, '.git/logs/refs/remotes/origin/master')); log.push('deleted reflog'); }
catch(e) { log.push('reflog already gone: ' + e.code); }

log.push('\n=== Step 3: Set remote HEAD to main ===');
try { log.push(execSync('git remote set-head origin main', { cwd: repo, encoding: 'utf8' })); }
catch(e) { log.push(e.stdout || e.message); }

log.push('\n=== Step 4: Prune stale remote refs ===');
try { log.push(execSync('git fetch origin --prune 2>&1', { cwd: repo, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] })); }
catch(e) { log.push((e.stdout || '') + (e.stderr || '') || e.message); }

log.push('\n=== Step 5: Verify cleanup (branch -a) ===');
try { log.push(execSync('git branch -a', { cwd: repo, encoding: 'utf8' })); }
catch(e) { log.push(e.stdout || e.message); }

log.push('\n=== Step 6: Confirm HEAD intact (log --oneline -3) ===');
try { log.push(execSync('git log --oneline -3', { cwd: repo, encoding: 'utf8' })); }
catch(e) { log.push(e.stdout || e.message); }

fs.writeFileSync(path.join(repo, 'tmp/cleanup-results.txt'), log.join('\n'));
