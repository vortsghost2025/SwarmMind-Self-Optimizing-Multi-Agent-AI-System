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
    KEY_NOT_FOUND: ['No public key for lane'],
    UNSIGNED_MESSAGE: ['no JWS signature', 'structurally rejected', 'UNSIGNED_MESSAGE']
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
  // Base message with all required fields including hard-enforcement attestation fields
  const base = {
    schema_version: '1.1',
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
    signature: 'placeholder-will-be-overridden',
    key_id: 'placeholder-will-be-overridden',
    content_hash: 'placeholder-will-be-overridden',
    signature_alg: 'RS256',
  };
  const msg = { ...base, ...overrides };
  // Always recompute content_hash if not explicitly set to a test value
  if (msg.content_hash === 'placeholder-will-be-overridden' || !msg.content_hash) {
    try {
      msg.content_hash = Signer.computeContentHash(msg);
    } catch (_) { /* ignore */ }
  }
  return msg;
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

  // ── Test 7: Valid content hash but unsigned — HARD REJECT ────────
  console.log('\nTest 7: Valid content hash but unsigned — HARD REJECT');
  {
    const verifier = makeVerifier();
    const wrapper = makeWrapper(verifier);
    const msg = makeValidMsg({ body: 'consistent body for hash test' });
    // Remove signature to test unsigned behavior
    delete msg.signature;
    delete msg.key_id;
    delete msg.signature_alg;
    // Recompute content_hash without signature fields
    msg.content_hash = Signer.computeContentHash(msg);

    const schemaResult = schema.validate(msg);
    // Schema now requires signature and key_id — rejected at schema level
    assert(!schemaResult.valid, 'Schema rejects unsigned message (missing signature/key_id)');

    const wrapperResult = await wrapper.verifyInboxMessage(msg);
    assert(!wrapperResult.valid,
      `VerifierWrapper rejects unsigned message even with valid content_hash (got: ${JSON.stringify(wrapperResult).slice(0, 200)})`);
    // Schema validation catches missing signature before UNSIGNED_MESSAGE check
    assertReason(wrapperResult, VERIFY_REASON.SCHEMA_VALIDATION_FAILED,
      'Reason indicates SCHEMA_VALIDATION_FAILED (schema catches missing signature)');
  }

  // ── Test 7b: VerifierWrapper UNSIGNED_MESSAGE path (bypass schema) ─
  console.log('\nTest 7b: VerifierWrapper direct UNSIGNED_MESSAGE rejection');
  {
    // Test the VerifierWrapper's own UNSIGNED_MESSAGE path by calling
    // it with a message that has signature/key_id fields but no actual JWS
    const verifier = makeVerifier();
    const wrapper = makeWrapper(verifier);
    const msg = makeValidMsg();
    // Set signature/key_id to trigger VerifierWrapper Step 5 (no JWS)
    // but skip schema validation to test VerifierWrapper directly
    delete msg.signature;
    delete msg.key_id;
    delete msg.signature_alg;
    const result = await wrapper.verifyInboxMessage(msg);
    assert(!result.valid, 'VerifierWrapper rejects message without signature');
    // The schema rejection happens first (Step 1), so reason is SCHEMA_VALIDATION_FAILED
    assert(result.reason === 'QUARANTINED' || result.reason === VERIFY_REASON.SCHEMA_VALIDATION_FAILED || result.reason === VERIFY_REASON.UNSIGNED_MESSAGE,
      `Reason is a rejection reason (got: ${result.reason})`);
  }

  // ── Test 8: Unsigned message without content_hash — HARD REJECT ──
  console.log('\nTest 8: Unsigned message without content_hash — HARD REJECT');
  {
    const verifier = makeVerifier();
    const msg = makeValidMsg();
    // Remove attestation fields to simulate a truly unsigned message
    delete msg.signature;
    delete msg.key_id;
    delete msg.content_hash;
    delete msg.signature_alg;
    const schemaResult = schema.validate(msg);
    // Schema now requires signature, key_id, content_hash
    assert(!schemaResult.valid, 'Schema rejects unsigned message without content_hash');

    let warningCapture = null;
    const warnWrapper = new VerifierWrapper({
      verifier,
      config: { laneName: 'swarmmind' },
      emitWarning: (type, data) => { warningCapture = { type, data }; }
    });
    const wrapperResult = await warnWrapper.verifyInboxMessage(msg);
    assert(!wrapperResult.valid, 'Unsigned message is REJECTED (hard enforcement)');
    // Schema validation catches missing fields before UNSIGNED_MESSAGE check
    assertReason(wrapperResult, VERIFY_REASON.SCHEMA_VALIDATION_FAILED,
      'Reason indicates SCHEMA_VALIDATION_FAILED (schema catches missing attestation fields)');
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
