'use strict';

function sanitizeFilename(input) {
  return String(input || '')
    .replace(/[:/\\?*"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/--+/g, '-');
}

module.exports = { sanitizeFilename };
