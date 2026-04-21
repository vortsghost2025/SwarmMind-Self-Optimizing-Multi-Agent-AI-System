const { InboxMessageSchema } = require('../src/attestation/InboxMessageSchema');
const { VerifierWrapper } = require('../src/attestation/VerifierWrapper');
const { Verifier } = require('../src/attestation/Verifier');
const { Signer } = require('../src/attestation/Signer');
const { KeyManager } = require('../src/attestation/KeyManager');
const { VERIFY_REASON } = require('../src/attestation/constants');
const { ensureTestTrustStore } = require('./test-support/trustStoreFixture');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✗ FAILED: ${message}`);
    failed++;
    return false;
  }
  console.log(`  ✓ ${message}`);
  passed++;
  return true;
}

function assertReason(result, expectedReason, label) {
  const actual = result.reason;
  if (actual === expectedReason) {
    assert(true, label);
    return;
  }
  if (actual === 'QUARANTINED' || actual === 'QUARANTINE_MAX_RETRIES') {
    const note = result.note || '';
    const reasonMap = {
      SCHEMA_VALIDATION_FAILED: ['Missing or empty required', 'schema_version', 'priority must be', 'from must be', 'from and to must differ', 'type must be'],
      UNKNOWN_SENDER_LANE: ['Unknown sender lane'],
      ROUTING_MISMATCH: ['Message addressed to', 'Invalid target lane', 'Signed from='],
      CONTENT_HASH_MISMATCH: ['Content hash mismatch'],
      SIGNATURE_MISMATCH: ['Malformed JWS', 'Invalid JWS', 'SIGNATURE_MISMATCH'],
      MISSING_LANE: ['missing lane', 'Outer envelope missing lane'],
      MISSING_SIGNATURE: ['No signature provided'],
      KEY_NOT_FOUND: ['No public key for lane']
    };
    const patterns = reasonMap[expectedReason] || [expectedReason];
    const matched = patterns.some(p => note.includes(p));
    if (matched) {
      assert(true, `${label} (via quarantine note)`);
      return;
    }
  }
  assert(false, `${label} — expected ${expectedReason}, got reason=${actual}, note=${(result.note || '').slice(0, 100)}`);
}

function makeValidMsg(overrides = {}) {
  return {
    schema_version: '1.0',
    id: `2026-04-21T01:00:00.000Z-msg-${Math.random().toString(36).slice(2, 8)}`,
    task_id: 'TASK-001',
    idempotency_key: 'idem-archivist-001',
    from: 'archivist',
    to: 'swarmmind',
    type: 'task',
    priority: 'P1',
    subject: 'Test message',
    timestamp: new Date().toISOString(),
    body: 'test body content',
    ...overrides
  };
}

async function run() {
  console.log('=== Verification Depth Test Suite ===\n');

  const schema = new InboxMessageSchema();
  const trustStorePath = ensureTestTrustStore({
    trustStorePath: path.join(process.cwd(), '.test-memory', 'verification-depth-trust-store.json'),
    reset: true
  });

  function makeVerifier() {
    return new Verifier({
      trustStorePath,
      testMode: true,
      allowMissingTrustStoreForTests: true
    });
  }

  function makeWrapper(verifier, opts = {}) {
    return new VerifierWrapper({ verifier, config: { laneName: 'swarmmind', ...opts } });
  }

  const signer = new Signer();

  // ── Test 1: Missing required field (task_id) ──────────────────────
  console.log('\nTest 1: Missing required field (task_id)');
  {
    const verifier = makeVerifier();
    const wrapper = makeWrapper(verifier);
    const msg = makeValidMsg();
    delete msg.task_id;
    const schemaResult = schema.validate(msg);
    assert(!schemaResult.valid, 'Schema rejects message missing task_id');
    assert(schemaResult.errors.some(e => e.includes('task_id')),
      'Error mentions missing task_id');

    const wrapperResult = await wrapper.verifyInboxMessage(msg);
    assert(!wrapperResult.valid, 'VerifierWrapper rejects message missing task_id');
    assertReason(wrapperResult, VERIFY_REASON.SCHEMA_VALIDATION_FAILED,
      'Reason indicates SCHEMA_VALIDATION_FAILED');
  }

  // ── Test 2: Invalid priority (P5) ─────────────────────────────────
  console.log('\nTest 2: Invalid priority (P5)');
  {
    const verifier = makeVerifier();
    const wrapper = makeWrapper(verifier);
    const msg = makeValidMsg({ priority: 'P5' });
    const schemaResult = schema.validate(msg);
    assert(!schemaResult.valid, 'Schema rejects P5 priority');
    assert(schemaResult.errors.some(e => e.includes('priority')),
      'Error mentions invalid priority');

    const wrapperResult = await wrapper.verifyInboxMessage(msg);
    assert(!wrapperResult.valid, 'VerifierWrapper rejects P5 priority');
    assertReason(wrapperResult, VERIFY_REASON.SCHEMA_VALIDATION_FAILED,
      'Reason indicates SCHEMA_VALIDATION_FAILED');
  }

  // ── Test 3: Invalid sender lane (unknown_lane) ────────────────────
  console.log('\nTest 3: Invalid sender lane (unknown_lane)');
  {
    const verifier = makeVerifier();
    const wrapper = makeWrapper(verifier);
    const msg = makeValidMsg({ from: 'unknown_lane', to: 'swarmmind' });
    const schemaResult = schema.validate(msg);
    assert(!schemaResult.valid, 'Schema rejects unknown sender lane');
    assert(schemaResult.errors.some(e => e.includes('from')),
      'Error mentions invalid from lane');

    const wrapperResult = await wrapper.verifyInboxMessage(msg);
    assert(!wrapperResult.valid, 'VerifierWrapper rejects unknown sender lane');
  }

  // ── Test 4: Wrong routing — to: archivist, our lane is swarmmind ──
  console.log('\nTest 4: Wrong routing (to=library, our lane=swarmmind)');
  {
    const verifier = makeVerifier();
    const wrapper = makeWrapper(verifier);
    const msg = makeValidMsg({ from: 'archivist', to: 'library',
      idempotency_key: 'idem-archivist-004' });
    const schemaResult = schema.validate(msg);
    assert(schemaResult.valid, 'Schema accepts message addressed to library');

    const wrapperResult = await wrapper.verifyInboxMessage(msg);
    assert(!wrapperResult.valid, 'VerifierWrapper rejects message not addressed to us');
    assertReason(wrapperResult, VERIFY_REASON.ROUTING_MISMATCH,
      'Reason indicates ROUTING_MISMATCH');
  }

  // ── Test 5: Self-addressed message (from=swarmmind, to=swarmmind) ─
  console.log('\nTest 5: Self-addressed message (from=swarmmind, to=swarmmind)');
  {
    const verifier = makeVerifier();
    const wrapper = makeWrapper(verifier);
    const msg = makeValidMsg({ from: 'swarmmind', to: 'swarmmind',
      idempotency_key: 'idem-swarmmind-005' });
    const schemaResult = schema.validate(msg);
    assert(!schemaResult.valid, 'Schema rejects self-addressed message');
    assert(schemaResult.errors.some(e => e.includes('from and to must differ')),
      'Error says from and to must differ');

    const wrapperResult = await wrapper.verifyInboxMessage(msg);
    assert(!wrapperResult.valid, 'VerifierWrapper rejects self-addressed message');
    assertReason(wrapperResult, VERIFY_REASON.SCHEMA_VALIDATION_FAILED,
      'Reason indicates SCHEMA_VALIDATION_FAILED');
  }

  // ── Test 6: Tampered content hash ─────────────────────────────────
  console.log('\nTest 6: Tampered content hash');
  {
    const verifier = makeVerifier();
    const wrapper = makeWrapper(verifier);
    const msg = makeValidMsg({
      content_hash: 'sha256:' + '0'.repeat(64)
    });
    const schemaResult = schema.validate(msg);
    assert(schemaResult.valid, 'Schema accepts well-formed (but wrong) content_hash');

    const wrapperResult = await wrapper.verifyInboxMessage(msg);
    assert(!wrapperResult.valid, 'VerifierWrapper rejects tampered content hash');
    assertReason(wrapperResult, VERIFY_REASON.CONTENT_HASH_MISMATCH,
      'Reason indicates CONTENT_HASH_MISMATCH');
  }

  // ── Test 7: Valid content hash ────────────────────────────────────
  console.log('\nTest 7: Valid content hash (unsigned, should pass)');
  {
    const verifier = makeVerifier();
    const wrapper = makeWrapper(verifier);
    const msg = makeValidMsg({ body: 'consistent body for hash test' });
    const correctHash = Signer.computeContentHash(msg);
    msg.content_hash = correctHash;

    const schemaResult = schema.validate(msg);
    assert(schemaResult.valid, 'Schema accepts message with valid content_hash');

    const wrapperResult = await wrapper.verifyInboxMessage(msg);
    assert(wrapperResult.valid,
      `VerifierWrapper accepts message with valid content hash (got: ${JSON.stringify(wrapperResult).slice(0, 200)})`);
    assert(wrapperResult.has_content_hash === true, 'Result indicates content_hash present');
    assert(wrapperResult.has_signature === false, 'Result indicates no signature (unsigned)');
  }

  // ── Test 8: Unsigned message (no content_hash, no signature) ──────
  console.log('\nTest 8: Unsigned message without content_hash');
  {
    const verifier = makeVerifier();
    const msg = makeValidMsg();
    const schemaResult = schema.validate(msg);
    assert(schemaResult.valid, 'Schema accepts unsigned message without content_hash');

    let warningCapture = null;
    const warnWrapper = new VerifierWrapper({
      verifier,
      config: { laneName: 'swarmmind' },
      emitWarning: (type, data) => { warningCapture = { type, data }; }
    });
    const wrapperResult = await warnWrapper.verifyInboxMessage(msg);
    assert(wrapperResult.valid, 'Unsigned message passes (backward compat)');
    assert(wrapperResult.has_signature === false, 'Result indicates no signature');
    assert(wrapperResult.has_content_hash === false, 'Result indicates no content_hash');
    assert(warningCapture && warningCapture.type === 'UNSIGNED_MESSAGE',
      'Warning emitted for unsigned message');
  }

  // ── Test 9: Bad JWS signature ─────────────────────────────────────
  console.log('\nTest 9: Bad JWS signature (malformed)');
  {
    const verifier = makeVerifier();
    const wrapper = makeWrapper(verifier);
    const msg = makeValidMsg({
      content_hash: Signer.computeContentHash(makeValidMsg()),
      signature: 'not-a-valid-jws-string',
      key_id: 'test-key-001'
    });
    const schemaResult = schema.validate(msg);
    assert(schemaResult.valid, 'Schema accepts message with signature field');

    const wrapperResult = await wrapper.verifyInboxMessage(msg);
    assert(!wrapperResult.valid, 'VerifierWrapper rejects malformed JWS');
    assert(
      wrapperResult.reason === VERIFY_REASON.SIGNATURE_MISMATCH ||
      wrapperResult.reason === VERIFY_REASON.MISSING_LANE ||
      (wrapperResult.note && (wrapperResult.note.includes('Malformed JWS') || wrapperResult.note.includes('missing lane'))),
      `Reason indicates signature/JWS failure (got: ${wrapperResult.reason}, note: ${(wrapperResult.note || '').slice(0, 80)})`
    );
  }

  // ── Test 10: Fully valid message with JWS signature ───────────────
  console.log('\nTest 10: Fully valid message with JWS signature');
  {
    const passphrase = process.env.LANE_KEY_PASSPHRASE;
    if (!passphrase) {
      console.log('  ⚠ SKIPPED: LANE_KEY_PASSPHRASE not set — cannot test JWS signing');
      console.log('  (Set LANE_KEY_PASSPHRASE to run full JWS verification test)');
    } else {
      try {
        const testIdDir = path.join(process.cwd(), '.test-identity-verification-depth');
        if (fs.existsSync(testIdDir)) fs.rmSync(testIdDir, { recursive: true, force: true });

        const km = new KeyManager({ laneId: 'archivist', identityDir: testIdDir });
        km.initialize(passphrase);
        const publicKey = km.loadPublicKey();
        const privateKey = km.loadPrivateKey(passphrase);
        const keyId = km.getPublicKeyInfo().key_id;

        const verifier10 = makeVerifier();
        verifier10.addTrustedKey('archivist', publicKey, keyId);
        const wrapper10 = makeWrapper(verifier10);

        const baseMsg = makeValidMsg({ from: 'archivist', to: 'swarmmind',
          idempotency_key: 'idem-archivist-010' });
        const signedMsg = signer.signInboxMessage(baseMsg, privateKey, keyId);
        signedMsg.lane = signedMsg.from;

        const schemaResult = schema.validate(signedMsg);
        assert(schemaResult.valid, 'Schema accepts fully signed message');

        const wrapperResult = await wrapper10.verifyInboxMessage(signedMsg);
        assert(wrapperResult.valid,
          `Fully signed message passes verification (got: ${JSON.stringify(wrapperResult).slice(0, 200)})`);
        assert(wrapperResult.has_signature === true, 'Result indicates signature present');
        assert(wrapperResult.has_content_hash === true, 'Result indicates content_hash present');
        assert(wrapperResult.depth === 6, `Depth is 6 (got: ${wrapperResult.depth})`);
        assert(wrapperResult.mode === 'INBOX_VERIFIED', `Mode is INBOX_VERIFIED (got: ${wrapperResult.mode})`);

        if (fs.existsSync(testIdDir)) fs.rmSync(testIdDir, { recursive: true, force: true });
      } catch (err) {
        if (err.message && err.message.includes('passphrase')) {
          console.log('  ⚠ SKIPPED: Key decryption failed — check LANE_KEY_PASSPHRASE');
          console.log(`  Error: ${err.message}`);
        } else {
          throw err;
        }
      }
    }
  }

  // ── Test 10b: Bad JWS with real keys (signature from wrong key) ───
  console.log('\nTest 10b: Valid JWS from untrusted key');
  {
    const passphrase = process.env.LANE_KEY_PASSPHRASE;
    if (!passphrase) {
      console.log('  ⚠ SKIPPED: LANE_KEY_PASSPHRASE not set');
    } else {
      try {
        const testIdDir = path.join(process.cwd(), '.test-identity-untrusted');
        if (fs.existsSync(testIdDir)) fs.rmSync(testIdDir, { recursive: true, force: true });

        const km2 = new KeyManager({ laneId: 'attacker', identityDir: testIdDir });
        km2.initialize(passphrase + '-different');
        const attackerPrivateKey = km2.loadPrivateKey(passphrase + '-different');
        const attackerKeyId = km2.getPublicKeyInfo().key_id;

        const verifier10b = makeVerifier();
        const wrapper10b = makeWrapper(verifier10b);

        const baseMsg = makeValidMsg({ from: 'archivist', to: 'swarmmind',
          idempotency_key: 'idem-archivist-010b' });
        const signedMsg = signer.signInboxMessage(baseMsg, attackerPrivateKey, attackerKeyId);
        signedMsg.lane = signedMsg.from;

        const wrapperResult = await wrapper10b.verifyInboxMessage(signedMsg);
        assert(!wrapperResult.valid, 'Message signed by untrusted key is rejected');

        if (fs.existsSync(testIdDir)) fs.rmSync(testIdDir, { recursive: true, force: true });
      } catch (err) {
        if (err.message && err.message.includes('passphrase')) {
          console.log('  ⚠ SKIPPED: Key decryption failed');
        } else {
          throw err;
        }
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────
  console.log(`\n=== Verification Depth Test Results ===`);
  console.log(`Passed: ${passed}, Failed: ${failed}`);

  // Clean up handoff file if created
  const handoffFile = path.join(process.cwd(), 'AGENT_HANDOFF_REQUIRED.md');
  if (fs.existsSync(handoffFile)) fs.unlinkSync(handoffFile);

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
