'use strict';

const MIN_MAJOR = 16;

function checkNodeVersion() {
  const major = parseInt(process.versions.node.split('.')[0], 10);
  if (major < MIN_MAJOR) {
    console.error(`FATAL: Node.js v${process.versions.node} is below minimum v${MIN_MAJOR}. ` +
      `Scripts using ?? or ?. syntax require Node >= ${MIN_MAJOR}. ` +
      `Source nvm or update .nvmrc: nvm use 20`);
    process.exit(1);
  }
  return major;
}

module.exports = { checkNodeVersion, MIN_MAJOR };
