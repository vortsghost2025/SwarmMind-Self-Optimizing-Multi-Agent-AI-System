#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const registryPath = 'S:/Archivist-Agent/lanes/broadcast/registry.json';
let registry;
try {
  registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
} catch (_) {
  console.error('Cannot load registry at', registryPath);
  process.exit(1);
}
let ok = true;
for (const [laneId, info] of Object.entries(registry.lanes || {})) {
  const root = info.local_path;
  if (!fs.existsSync(root)) {
    console.error(`MISSING: ${laneId} root ${root}`);
    ok = false;
  } else {
    console.log(`OK: ${laneId} -> ${root}`);
  }
}
process.exit(ok ? 0 : 1);
