#!/usr/bin/env node
/**
 * auto-journal.js
 * Autonomous journal update script
 * Runs post-commit or on schedule to extract OUTPUT_PROVENANCE headers
 * and auto-append entries to upgrade_journal.md
 *
 * Part of SwarmMind S4 (stale-work) detection for un-journaled commits
 *
 * Schedule: Daily or post-commit hook
 * Author: SwarmMind Auto-Journal
 * Generated: 2026-05-31T19:55:00Z
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const JOURNAL_PATH = '/home/we4free/agent/strategic_upgrades/upgrade_journal.md';
const REPOS_DIR = '/home/we4free/agent/repos';

const TIMESTAMP = new Date().toISOString();

function log(msg) {
  console.log(`[${TIMESTAMP}] auto-journal: ${msg}`);
}

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 30000 });
  } catch (err) {
    return `ERROR: ${err.message}`;
  }
}

function getLastCommitInfo(repoPath) {
  try {
    const hash = run(`cd ${repoPath} && git log -1 --pretty=format:"%H"`).trim();
    const subject = run(`cd ${repoPath} && git log -1 --pretty=format:"%s"`).trim();
    const date = run(`cd ${repoPath} && git log -1 --pretty=format:"%ci"`).trim();
    const author = run(`cd ${repoPath} && git log -1 --pretty=format:"%an"`).trim();
    return { hash, subject, date, author, repo: path.basename(repoPath) };
  } catch (err) {
    return null;
  }
}

function checkOutputProvenance(repoPath) {
  try {
    const files = run(`cd ${repoPath} && git log -1 --name-only --pretty=""`).split('\n').filter(f => f.trim());
    const provenanceFiles = files.filter(f =>
      f.includes('OUTPUT_PROVENANCE') ||
      f.includes('output_provenance') ||
      f.includes('.provenance')
    );
    return {
      hasProvenance: provenanceFiles.length > 0,
      files
    };
  } catch (err) {
    return { hasProvenance: false, files: [] };
  }
}

function generateJournalEntry(commitInfo, provenanceCheck) {
  const date = new Date().toISOString().split('T')[0];
  const time = new Date().toISOString().split('T')[1].split('.')[0] + 'Z';

  let details = `Auto-captured from ${commitInfo.repo}@${commitInfo.hash.slice(0,7)}: "${commitInfo.subject}"`;
  if (provenanceCheck.hasProvenance) {
    details += ` [OUTPUT_PROVENANCE: present]`;
  } else {
    details += ` [WARNING: no OUTPUT_PROVENANCE header detected]`;
  }

  return `| ${date}T${time} | Auto-capture | ${details} | ${commitInfo.repo}/${commitInfo.hash.slice(0,7)} | AUTO |`;
}

function appendToJournal(entry) {
  try {
    if (!fs.existsSync(JOURNAL_PATH)) {
      log(`Journal not found at ${JOURNAL_PATH}, creating new`);
      fs.writeFileSync(JOURNAL_PATH, `# Strategic Autonomous Capability Upgrades - Upgrade Journal\n\n`);
    }

    const content = fs.readFileSync(JOURNAL_PATH, 'utf8');
    const lines = content.split('\n');

    // Find the last table row or insert before "## Next Steps" or at end
    let insertIndex = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith('|')) {
        insertIndex = i + 1;
        break;
      }
      if (lines[i].startsWith('## ')) {
        insertIndex = i;
        break;
      }
    }

    lines.splice(insertIndex, 0, entry);
    fs.writeFileSync(JOURNAL_PATH, lines.join('\n'));
    log(`Appended entry to journal`);
    return true;
  } catch (err) {
    log(`ERROR writing to journal: ${err.message}`);
    return false;
  }
}

async function main() {
  log('=== Auto-Journal STARTED ===');

  const repos = [
    'Archivist-Agent',
    'kernel-lane',
    'self-organizing-library',
    'SwarmMind-Self-Optimizing-Multi-Agent-AI-System'
  ];

  let processed = 0;
  let appended = 0;

  for (const repo of repos) {
    const repoPath = path.join(REPOS_DIR, repo);
    if (!fs.existsSync(repoPath)) {
      log(`Repo not found: ${repoPath}`);
      continue;
    }

    const lastCommit = getLastCommitInfo(repoPath);
    if (!lastCommit) {
      log(`Could not get commit info for ${repo}`);
      continue;
    }

    const provenance = checkOutputProvenance(repoPath);
    const entry = generateJournalEntry(lastCommit, provenance);

    log(`Repo: ${repo} | Commit: ${lastCommit.hash.slice(0,7)} | Provenance: ${provenance.hasProvenance}`);

    if (appendToJournal(entry)) {
      appended++;
    }
    processed++;
  }

  log(`=== Auto-Journal COMPLETE: ${appended}/${processed} entries appended ===`);

  return { processed, appended };
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});