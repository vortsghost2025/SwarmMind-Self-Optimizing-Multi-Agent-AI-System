const fs = require('fs');
const path = require('path');
const { getRoots, sToLocal, LANES: _DL } = require('./util/lane-discovery');

const DEFAULT_AGE_DAYS = 7;

function compactProcessed(inboxBase, laneId, dryRun, ageDays) {
  const processedDir = path.join(inboxBase, 'processed');
  const archiveDir = path.join(inboxBase, 'processed-archive');

  if (!fs.existsSync(processedDir)) {
    console.log(`${laneId}: no processed/ directory, skipping`);
    return { moved: 0, skipped: 0 };
  }

  const files = fs.readdirSync(processedDir).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.log(`${laneId}: processed/ is empty, nothing to compact`);
    return { moved: 0, skipped: 0 };
  }

  const threshold = Date.now() - ageDays * 86400000;
  let moved = 0;
  let skipped = 0;

  for (const f of files) {
    const fp = path.join(processedDir, f);
    try {
      const st = fs.statSync(fp);
      if (st.mtimeMs < threshold) {
        if (!dryRun) {
          fs.mkdirSync(archiveDir, { recursive: true });
          const dest = path.join(archiveDir, f);
          if (!fs.existsSync(dest)) {
            fs.renameSync(fp, dest);
          } else {
            fs.unlinkSync(fp);
          }
        }
        moved++;
      } else {
        skipped++;
      }
    } catch (e) {
      console.error(`${laneId}: error processing ${f}: ${e.message}`);
      skipped++;
    }
  }

  console.log(`${laneId}: ${dryRun ? '[DRY-RUN] ' : ''}${moved} archived (>${ageDays}d old), ${skipped} kept`);
  return { moved, skipped };
}

const dryRun = process.argv.includes('--dry-run');
const ageArg = process.argv.find(a => a.startsWith('--age-days='));
const ageDays = ageArg ? parseInt(ageArg.split('=')[1], 10) || DEFAULT_AGE_DAYS : DEFAULT_AGE_DAYS;

const LANES = {
  swarmmind: { inbox: path.join(sToLocal('S:/SwarmMind'), 'lanes', 'swarmmind', 'inbox') },
  archivist: { inbox: path.join(getRoots()['archivist'], 'lanes', 'archivist', 'inbox') },
  kernel: { inbox: path.join(getRoots()['kernel'], 'lanes', 'kernel', 'inbox') },
  library: { inbox: path.join(getRoots()['library'], 'lanes', 'library', 'inbox') },
};

let totalMoved = 0;
let totalSkipped = 0;

for (const [laneId, cfg] of Object.entries(LANES)) {
  const result = compactProcessed(cfg.inbox, laneId, dryRun, ageDays);
  totalMoved += result.moved;
  totalSkipped += result.skipped;
}

console.log(`\nTotal: ${dryRun ? '[DRY-RUN] ' : ''}${totalMoved} archived, ${totalSkipped} kept across all lanes`);
