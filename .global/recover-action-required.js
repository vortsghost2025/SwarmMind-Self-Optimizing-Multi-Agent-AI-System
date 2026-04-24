#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const laneArg = args[args.indexOf('--lane') + 1];
const applyFlag = args.includes('--apply');
if (!laneArg) { console.error('Usage: node recover-action-required.js --lane <lane> [--apply]'); process.exit(1); }
const baseDir = path.join(__dirname, '..', 'lanes', laneArg);
const processedDir = path.join(baseDir, 'inbox', 'processed');
const pendingDir = path.join(baseDir, 'inbox', 'pending');
if (!fs.existsSync(processedDir)) { console.log(laneArg + ': no processed/'); process.exit(0); }
fs.mkdirSync(pendingDir, { recursive: true });
function hasCompletionProof(m) { return !!(m.completion_artifact_path || m.resolved_by_task_id || m.terminal_decision); }
let moved = 0;
fs.readdirSync(processedDir).filter(f => f.endsWith('.json')).forEach(f => {
  const msg = JSON.parse(fs.readFileSync(path.join(processedDir, f), 'utf8'));
  if (msg.requires_action === true && !hasCompletionProof(msg)) {
    if (applyFlag) {
      const dest = path.join(pendingDir, f);
      fs.writeFileSync(dest, JSON.stringify(msg, null, 2));
      fs.unlinkSync(path.join(processedDir, f));
      console.log('MOVED: ' + f);
    } else console.log('WOULD MOVE: ' + f);
    moved++;
  }
});
console.log(laneArg + ': ' + moved + ' actionable items without proof' + (applyFlag ? ' (moved)' : ''));
