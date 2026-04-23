const fs = require('fs');
const path = require('path');

function baseTrustStore() {
  return {
    version: '1.0',
    keys: {},
    migration: {},
    updated_at: new Date().toISOString(),
  };
}

function ensureTestTrustStore(options = {}) {
  const trustStorePath =
    options.trustStorePath ||
    process.env.ATTESTATION_TRUST_STORE ||
    path.join(process.cwd(), '.test-memory', 'trust-store.json');

  const reset = options.reset === true;
  const dir = path.dirname(trustStorePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (reset || !fs.existsSync(trustStorePath)) {
    fs.writeFileSync(trustStorePath, JSON.stringify(baseTrustStore(), null, 2), 'utf8');
  }

  process.env.ATTESTATION_TRUST_STORE = trustStorePath;
  process.env.SWARM_TEST_MODE = '1';
  return trustStorePath;
}

module.exports = {
  ensureTestTrustStore,
};
