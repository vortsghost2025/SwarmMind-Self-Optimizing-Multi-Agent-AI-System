/**
 * Remove temp files older than 1 day from tmp/ directories
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getRoots, sToLocal, LANES: _DL } = require('./util/lane-discovery');


function cleanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const now = Date.now();
  fs.readdirSync(dir).forEach(f => {
    const fp = path.join(dir, f);
    try {
      const st = fs.statSync(fp);
      if (st.isFile() && (now - st.mtimeMs) > 86400000) {
        fs.unlinkSync(fp);
        console.log('Removed stale temp:', fp);
      }
    } catch (_) {}
  });
}

// Common temp locations
['tmp/', sToLocal('S:/SwarmMind/tmp/'), os.tmpdir() + '/swarmmind/'].forEach(cleanDir);
console.log('Cleanup complete.');
