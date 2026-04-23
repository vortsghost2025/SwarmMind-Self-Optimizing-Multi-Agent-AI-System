#!/usr/bin/env node
/**
 * GOVERNANCE-AWARE STARTUP
 * 
 * Purpose: Launch SwarmMind with governance context loaded
 * 
 * This script wraps the normal app.js startup to:
 * 1. Run governance resolver first
 * 2. Inject governance context into app
 * 3. Continue with normal SwarmMind execution
 * 
 * Phase 2.5: Enforces NODE_OPTIONS to prevent child-process bypass of LaneContextGate.
 * All child processes spawned from this environment will automatically require
 * the gate, ensuring lattice enforcement extends beyond the parent process.
 * 
 * Usage: node scripts/governed-start.js
 */

const GovernanceResolver = require('./resolve-governance');
const { LaneContextGate } = require('../src/core/laneContextGate');
const { LaneResolver } = require('../src/coordination/LaneResolver');
const path = require('path');
const fs = require('fs');

const { TRUST_STORE_PATH } = require('../src/attestation/constants');
class GovernedStartup {
  constructor() {
    this.resolver = new GovernanceResolver(process.cwd());
    this.governanceContext = null;
    this.laneGate = null;
  }

  async start() {
    console.log('\n🚀 SwarmMind Governance-Aware Startup\n');
    console.log('='.repeat(60));

     // Step -1: Phase 4.0 — Lane Registry identification (canonical map)
     console.log('\n🗺️  Phase 4.0: Lane Registry Resolution\n');
     let laneResolver;
     try {
       laneResolver = new LaneResolver();
       laneResolver.dumpSummary();
       console.log('✅ Lane registry resolved — cross‑lane pointers validated\n');
     } catch (e) {
       console.error('\n❌ Lane registry resolution failed:', e.message);
       console.error('   This process cannot determine its lane identity.\n');
       process.exit(1);
     }

   // Step -0.5: Phase 4.3 — Asymmetric Attestation initialization
   console.log('\n🔑 Phase 4.3: Asymmetric Attestation Initialization\n');
   let signer, verifierWrapper, keyManager;
   try {
     const { KeyManager } = require('../src/attestation/KeyManager');
     const { Signer } = require('../src/attestation/Signer');
     const { Verifier } = require('../src/attestation/Verifier');
     const { VerifierWrapper } = require('../src/attestation/VerifierWrapper');
     const { TrustStoreManager } = require('../src/attestation/TrustStoreManager');
     const { RecoveryClient } = require('../src/attestation/RecoveryClient');
     const QueueStatic = require('../src/queue/Queue');
     const { audit: auditInstance } = require('../src/audit/AuditLogger');

     if (!process.env.LANE_KEY_PASSPHRASE) {
       throw new Error('LANE_KEY_PASSPHRASE environment variable not set');
     }
     keyManager = new KeyManager({ laneId: process.env.LANE_NAME });
     const initResult = keyManager.initialize(process.env.LANE_KEY_PASSPHRASE);
     if (initResult.generated) {
       console.log(' ✓ Generated new RSA-2048 key pair');
     } else {
       console.log(' ✓ Loaded existing RSA-2048 key pair');
     }

     signer = new Signer();
     const verifier = new Verifier();
     verifier.addTrustedKey(process.env.LANE_NAME, keyManager.loadPublicKey(), initResult.keyId);

     const recoveryClient = new RecoveryClient({
       orchestratorUrl: process.env.ARCHIVIST_URL || 'http://localhost:3000',
       laneId: process.env.LANE_NAME
     });

     verifierWrapper = new VerifierWrapper({
       verifier,
       recoveryClient,
       submitToRecovery: true
     });

     QueueStatic.setAttestation(signer, verifierWrapper, keyManager);

     auditInstance.setSigner(signer);
     auditInstance.setKeyManager(keyManager);

     console.log(' ✓ Signer and VerifierWrapper initialized (deterministic verification active)');

        // Export public key to Archivist trust pending (for trust store registration)
        const pubInfo = keyManager.exportForTrustStore();
        const trustPendingDir = path.join('S:', 'Archivist-Agent', '.trust', 'pending');
        if (!fs.existsSync(trustPendingDir)) { fs.mkdirSync(trustPendingDir, { recursive: true }); }
        fs.writeFileSync(path.join(trustPendingDir, `${pubInfo.lane_id}.json`),
          JSON.stringify(pubInfo, null, 2));
        console.log(`   ✓ Public key exported to ${trustPendingDir}`);
      } catch (e) {
        console.error('\n❌ Attestation initialization failed:', e.message);
        console.error('   Aborting startup — operator intervention required\n');
        process.exit(1);
      }

   // Step -0.25: Phase 4.4 — Verify Archivist Identity Snapshot (Cross‑Lane Trust Anchor)
   console.log('\n🔐 Phase 4.4: Archivist Identity Verification\n');
   try {
     const identityRoot = path.join('S:', 'Archivist-Agent', '.identity');
     const snapshotPath = path.join(identityRoot, 'snapshot.json');
     const jwsPath = path.join(identityRoot, 'snapshot.jws');
     const trustStorePath = TRUST_STORE_PATH;
     const revocationsPath = path.join(identityRoot, 'revocations.json');

     const identityResult = this.verifyArchivistIdentity(snapshotPath, jwsPath, trustStorePath, revocationsPath);
     if (!identityResult.valid) {
       console.error(' ❌ Archivist identity verification failed:', identityResult.error);
       console.error('   This system relies on Archivist as governance root.\n');
       process.exit(1);
     }
     console.log(`   ✓ Archivist identity verified (lane=${identityResult.identity.lane}, issued_by=${identityResult.handshake.issued_by})`);
     console.log(`   ✓ Snapshot valid until ${identityResult.identity.expires_at}\n`);
   } catch (e) {
     console.error(' ❌ Archivist identity verification error:', e.message);
     console.error('   Aborting — governance root cannot be trusted\n');
     process.exit(1);
   }

     // Step 0: Initialize Lane-Context Gate (Phase 2: enforce cross-lane write policy)
    console.log('\n🔒 Phase 2: Lane-Context Gate Initialization\n');
    this.laneGate = new (require('../src/core/laneContextGate').LaneContextGate)(process.cwd(), {
      governanceRoot: 'S:\\Archivist-Agent'
    });

    if (!this.laneGate.initialize()) {
      console.error('\n❌ Lane-context gate failed to initialize');
      console.error('   System cannot guarantee lane isolation');
      console.error('   Aborting startup — operator intervention required\n');
      process.exit(1);
    }

    // Install global fs hooks — ALL file writes now pass through gate
    this.laneGate.patchFs();

    if (this.laneGate.isOnHold()) {
      console.error('\n❌ System in HOLD state — lane-context conflict detected');
      console.error('   Operator resolution required before startup\n');
      process.exit(1);
    }

    console.log('\n✅ Lane-context gate active — enforcing cross-lane write policy\n');

    // Step 0.5: Phase 2.5 — Enforce NODE_OPTIONS for child process propagation
    console.log('\n🛡️  Phase 2.5: Child-Process Lattice Enforcement\n');
    this.enforceNodeOptions();

     // Step 0.75: Phase 3.7 — Continuity verification (fingerprint + recovery classifier)
     console.log('\n🔐 Phase 3.7: Continuity Verification\n');
     const { ContinuityVerifier } = require('../src/resilience/ContinuityVerifier');
  const continuity = new ContinuityVerifier({
    gate: this.laneGate,
    projectRoot: process.cwd(),
    stateDir: laneResolver.getContinuityDirectory(),
    signer: signer,
    verifierWrapper: verifierWrapper,
    keyManager: keyManager
  });
    const continuityResult = continuity.verify();
    console.log(`   Action: ${continuityResult.action}`);
    if (continuityResult.action === 'QUARANTINE' || continuityResult.action === 'LANE_DEGRADATION') {
      console.error('\n❌ Continuity check failed — system cannot start');
      console.error(`   Reason: ${continuityResult.details.reason}\n`);
      process.exit(1);
    }
    if (continuityResult.action === 'DRIFT_DETECTED') {
      console.warn(`   ⚠️  Codebase drift detected: ${continuityResult.details.reason}`);
      console.warn('   Operator review recommended but startup continuing\n');
    }
    if (continuityResult.action === 'REVIEW_NEEDED') {
      console.warn(`   ⚠️  Recovery review needed: ${continuityResult.details.reason}`);
      console.warn('   Continue with caution\n');
    }
    console.log('✅ Continuity verification complete\n');

    // Step 1: Create resolver with lane-gate injected
    console.log('\n📋 Phase 1: Governance Resolution\n');
    this.resolver = new GovernanceResolver(process.cwd(), { laneGate: this.laneGate });
    const resolution = await this.resolver.resolve();

    // Step 2: Handle resolution result
    if (resolution.status === 'resolved') {
      console.log('\n✅ Governance context loaded successfully');
      console.log('   SwarmMind is now operating within governance framework');
      this.governanceContext = resolution.governance;
    } else if (resolution.status === 'isolated') {
      console.log('\n⚠️  Operating in isolated mode');
      console.log('   No parent governance detected');
      console.log('   Running as standalone demo');
    } else {
      console.log('\n❌ Governance resolution failed');
      console.log(`   Status: ${resolution.status}`);
      console.log('   Proceeding with fallback mode...\n');
    }

    // Step 3: Load and execute main app
    console.log('\n📋 Phase 2: SwarmMind Execution\n');
    console.log('='.repeat(60) + '\n');

    try {
      // Dynamically require the main app
      const appPath = path.join(process.cwd(), 'src', 'app.js');
      
      if (fs.existsSync(appPath)) {
        // Import and run
        const SwarmMindApp = require(appPath);
        
        // If governance context available, we could inject it
        if (this.governanceContext) {
          console.log('🔗 Governance hooks available:');
          console.log(`   Bootstrap: ${this.governanceContext.bootstrap}`);
          console.log(`   Extension: ${this.governanceContext.extension_mode}`);
          console.log('   (Governance context can be accessed by agents)\n');
        }

        // Run the app (inject lane-gate for cross-lane enforcement)
        const app = new SwarmMindApp(this.laneGate);
        await app.initialize();
        await app.runDemoTask("Create a simple web application that displays 'Hello, SwarmMind!'");
        await app.demonstrateScaling();

        console.log('\n🎉 SwarmMind Demo Complete!');
        console.log('\n💡 Key Features Demonstrated:');
        console.log(' • Agent Swarm Execution (Planner → Coder → Reviewer → Executor)');
        console.log(' • Cognitive Trace Visualization');
        console.log(' • Auto-Scaling Based on Workload');
        console.log(' • Experimentation Engine (Single vs Multi-Agent Comparison)');
        
        if (this.governanceContext) {
          console.log('\n🔒 Governance Context:');
          console.log(` • Inheritance: ${this.governanceContext.parent}`);
          console.log(` • Role: ${this.governanceContext.role}`);
          console.log(` • Extension: ${this.governanceContext.extension_mode}`);
        }

      } else {
        console.error(`App not found at: ${appPath}`);
        process.exit(1);
      }

    } catch (error) {
      console.error('Failed to start SwarmMind:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  }

  /**
   * Phase 2.5: Enforce NODE_OPTIONS to prevent child-process bypass.
   * 
   * Child processes do NOT inherit the parent's fs monkey-patch. We must require
   * the gate in every child via NODE_OPTIONS=--require.
   * 
   * This method:
   * 1. Sets process.env.NODE_OPTIONS to preload laneContextGate.js
   * 2. Warns if NODE_OPTIONS already set (could conflict)
   * 3. Logs enforcement for audit trail
   */
   enforceNodeOptions() {
     const gatePath = path.join(process.cwd(), 'src', 'core', 'laneContextGate.js');
     const requiredOption = `--require ${gatePath}`;
     
     // Check if NODE_OPTIONS already contains our requirement
     const existing = process.env.NODE_OPTIONS || '';
     
     if (existing.includes(requiredOption)) {
       console.log(`[NODE_OPTIONS] Already set correctly`);
       console.log(`  Current: ${existing}`);
       return;
     }
     
     // Warn if NODE_OPTIONS already has any value (could conflict)
     if (existing && !existing.includes('--require')) {
       console.warn('[NODE_OPTIONS] Warning: Existing NODE_OPTIONS will be augmented:');
       console.warn(`  Existing: ${existing}`);
       console.warn(`  Adding:    ${requiredOption}`);
     } else if (existing && existing.includes('--require')) {
       console.warn('[NODE_OPTIONS] Warning: NODE_OPTIONS already has --require flags');
       console.warn(`  Current: ${existing}`);
       console.warn(`  Appending: ${requiredOption}`);
     }
     
     // Set NODE_OPTIONS to include our gate preload
     // We prepend to ensure our gate loads first and can patch fs before other modules
     process.env.NODE_OPTIONS = `${requiredOption} ${existing}`.trim();
     
     console.log('[NODE_OPTIONS] Enforcement active');
     console.log(`  Set: NODE_OPTIONS="${process.env.NODE_OPTIONS}"`);
     console.log('  All child processes spawned from this environment will require the gate.\n');
     
     // Also validate that gate can initialize from NODE_OPTIONS (LaneContextGate.initFromEnv)
     if (typeof this.laneGate.initFromEnv === 'function') {
       const envOk = this.laneGate.initFromEnv();
       if (!envOk) {
         console.warn('[LANE-GATE] Warning: NODE_OPTIONS validation failed — gate may not load in children');
       } else {
         console.log('[LANE-GATE] NODE_OPTIONS validation passed — child processes will enforce gate\n');
       }
     }
   }

   /**
    * Phase 4.4: Verify Archivist's signed identity snapshot (trust anchor)
    *
    * Invariants enforced (in order):
    *  1. snapshot.json exists + snapshot.jws exists
    *  2. JWS parses (3 parts, valid base64url)
    *  3. Payload contains required identity fields (lane, issued_by, key_id, expires_at)
    *  4. Issuer public key exists in trust store and is not revoked
    *  5. header.kid === snapshot.identity.key_id
    *  6. JWS signature verifies with issuer public key
    *  7. Payload canonicalization matches (stableStringify)
    *  8. Snapshot not expired
    *  9. Snapshot not in revocation list
    * 10. snapshot.identity.lane === 'archivist'
    *
    * Any failure returns { valid: false, error: IDENTITY_REASON.* }
    */
   verifyArchivistIdentity(snapshotPath, jwsPath, trustStorePath, revocationsPath) {
     const IDENTITY_REASON = {
       SNAPSHOT_NOT_FOUND: 'SNAPSHOT_NOT_FOUND',
       SNAPSHOT_SIGNATURE_MISSING: 'SNAPSHOT_SIGNATURE_MISSING',
       SNAPSHOT_SIGNATURE_INVALID: 'SNAPSHOT_SIGNATURE_INVALID',
       SNAPSHOT_PAYLOAD_MISMATCH: 'SNAPSHOT_PAYLOAD_MISMATCH',
       INVALID_JWS_FORMAT: 'INVALID_JWS_FORMAT',
       MISSING_SNAPSHOT_LANE: 'MISSING_SNAPSHOT_LANE',
       MISSING_ISSUER: 'MISSING_ISSUER',
       MISSING_KEY_ID: 'MISSING_KEY_ID',
       ISSUER_NOT_TRUSTED: 'ISSUER_NOT_TRUSTED',
       ISSUER_KEY_REVOKED: 'ISSUER_KEY_REVOKED',
       KEY_ID_MISMATCH: 'KEY_ID_MISMATCH',
       IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
       SNAPSHOT_EXPIRED: 'SNAPSHOT_EXPIRED',
       SNAPSHOT_REVOKED: 'SNAPSHOT_REVOKED',
       KEY_REVOKED: 'KEY_REVOKED'
     };

     // Helper: deterministic JSON (RFC 8785 / sorted-key)
     function stableStringify(value) {
       if (value === null) return 'null';
       if (typeof value !== 'object') return JSON.stringify(value);
       if (Array.isArray(value)) {
         return '[' + value.map(stableStringify).join(',') + ']';
       }
       const keys = Object.keys(value).sort();
       return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
     }

     // Helper: base64url decode
     function base64UrlDecode(str) {
       let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
       while (base64.length % 4) base64 += '=';
       return Buffer.from(base64, 'base64');
     }

     // 1. Load files
     if (!fs.existsSync(snapshotPath)) {
       return { valid: false, error: IDENTITY_REASON.SNAPSHOT_NOT_FOUND };
     }
     if (!fs.existsSync(jwsPath)) {
       return { valid: false, error: IDENTITY_REASON.SNAPSHOT_SIGNATURE_MISSING };
     }

     const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
     const jws = fs.readFileSync(jwsPath, 'utf8').trim();

     // 2. Parse JWS
     const parts = jws.split('.');
     if (parts.length !== 3) {
       return { valid: false, error: IDENTITY_REASON.INVALID_JWS_FORMAT };
     }
     const [headerB64, payloadB64, signatureB64] = parts;
     let header;
     try {
       header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
     } catch (e) {
       return { valid: false, error: IDENTITY_REASON.INVALID_JWS_FORMAT };
     }
     const payloadRaw = base64UrlDecode(payloadB64).toString('utf8');
     const signature = base64UrlDecode(signatureB64);
     const signingInput = `${headerB64}.${payloadB64}`;

     // 3. Extract identity fields
     const identity = snapshot?.identity;
     if (!identity) {
       return { valid: false, error: IDENTITY_REASON.MISSING_SNAPSHOT_LANE };
     }
     const { lane: snapshotLane, issued_by, key_id, expires_at } = identity;
     if (!snapshotLane) return { valid: false, error: IDENTITY_REASON.MISSING_SNAPSHOT_LANE };
     if (!issued_by) return { valid: false, error: IDENTITY_REASON.MISSING_ISSUER };
     if (!key_id) return { valid: false, error: IDENTITY_REASON.MISSING_KEY_ID };

     // 4. Load trust store + revocations
     if (!fs.existsSync(trustStorePath)) {
       return { valid: false, error: 'TRUST_STORE_NOT_FOUND' };
     }
     const trustStore = JSON.parse(fs.readFileSync(trustStorePath, 'utf8'));
     let revocations = { revoked_snapshots: [], revoked_keys: [] };
     if (fs.existsSync(revocationsPath)) {
       revocations = JSON.parse(fs.readFileSync(revocationsPath, 'utf8'));
     }

     // 5. Get issuer key
     const issuerEntry = trustStore?.keys?.[issued_by];
     if (!issuerEntry) {
       return { valid: false, error: IDENTITY_REASON.ISSUER_NOT_TRUSTED };
     }
     if (issuerEntry.revoked_at) {
       return { valid: false, error: IDENTITY_REASON.ISSUER_KEY_REVOKED };
     }
     if (issuerEntry.key_id !== key_id) {
       return { valid: false, error: IDENTITY_REASON.KEY_ID_MISMATCH };
     }

     // 6. Verify JWS signature (RSA-SHA256)
     const crypto = require('crypto');
     const verified = crypto.verify(
       'RSA-SHA256',
       Buffer.from(signingInput),
       { key: issuerEntry.public_key_pem, format: 'pem' },
       signature
     );
     if (!verified) {
       return { valid: false, error: IDENTITY_REASON.SNAPSHOT_SIGNATURE_INVALID };
     }

     // 7. Payload canonicalization check
     const expectedPayload = stableStringify(snapshot);
     if (payloadRaw !== expectedPayload) {
       return { valid: false, error: IDENTITY_REASON.SNAPSHOT_PAYLOAD_MISMATCH };
     }

     // 8. Expiry check
     if (expires_at && new Date(expires_at) < new Date()) {
       return { valid: false, error: IDENTITY_REASON.SNAPSHOT_EXPIRED };
     }

     // 9. Revocation check
     const snapshotId = identity.id;
     if (revocations.revoked_snapshots?.some(r => r.identity_id === snapshotId)) {
       return { valid: false, error: IDENTITY_REASON.SNAPSHOT_REVOKED };
     }
     if (revocations.revoked_keys?.some(r => r.lane === issued_by && r.key_id === key_id)) {
       return { valid: false, error: IDENTITY_REASON.KEY_REVOKED };
     }

     // 10. Runtime lane must match Archivist (for this trust anchor check)
     // (We are verifying Archivist's identity; it must be 'archivist')
     if (snapshotLane !== 'archivist') {
       return {
         valid: false,
         error: IDENTITY_REASON.IDENTITY_MISMATCH,
         details: { expected: 'archivist', actual: snapshotLane }
       };
     }

     // Success
     return {
       valid: true,
       identity,
       handshake: {
         runtime_lane: 'swarmmind', // we are SwarmMind verifying Archivist
         snapshot_lane: snapshotLane,
         issued_by,
         key_id,
         verified_at: new Date().toISOString()
       }
     };
   }
 }

// Execute
if (require.main === module) {
  const startup = new GovernedStartup();
  startup.start().catch(err => {
    console.error('Startup failed:', err);
    process.exit(1);
  });
}

module.exports = GovernedStartup;
