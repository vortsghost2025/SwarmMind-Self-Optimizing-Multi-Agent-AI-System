**SwarmMind HMAC / Outcome Audit**

| File & Line | What the code does | Anchor‑policy compliance |
|-------------|-------------------|--------------------------|
| src/attestation/VerifierWrapper.js:35‑38 | Checks item.signature. If missing, returns failure via _handleFailure with VERIFY_REASON.MISSING_SIGNATURE. No fallback. | hmac_accepted: false – signatures are required (missing‑signature mode = REJECT). |
| src/attestation/VerifierWrapper.js:71‑74 | After extracting signed payload lane, compares it to outer envelope lane. If differ, returns failure with VERIFY_REASON.LANE_MISMATCH. | Uses canonical VERIFY_REASON codes – no conflicting outcome protocol. |
| src/attestation/VerifierWrapper.js:84‑90 | Fetches public key only after lane consistency verified, then runs crypto verification. | Lane identity is checked before any crypto operation, satisfying deterministic flow. |
| src/attestation/Verifier.js:188‑191 | If item.signature missing, returns {valid:false, error:VERIFY_REASON.MISSING_SIGNATURE, note:'HMAC fallback removed - SIGNATURE_REQUIRED' }. HMAC fallback removed. | hmac_accepted: false – missing signatures are REJECTED. |
| src/attestation/Verifier.js:220‑232 | getMigrationStatus() returns dual_mode_active:false, hmac_accepted:false, jws_required:true, migration_status:'JWS_ONLY_ENFORCED'. | Explicitly states HMAC fallback disabled. |
| src/attestation/Verifier.js | All verification paths rely on JWS‑only verification and use shared VERIFY_REASON constants for outcomes. No alternative ACCEPT/REJECT enum. | Outcome handling follows canonical outcome protocol (VERIFY_REASON), no conflicting protocol detected. |
| src/attestation/Verifier.js – No isHMACAccepted() or similar helper present | Comment // isHMACAccepted() removed - HMAC fallback fully deprecated indicates helper removed. | No hidden acceptance path; HMAC is not accepted anywhere. |
| src/queue/Queue.js:94‑96 | Throws error SIGNER_REQUIRED: JWS signing required - HMAC fallback removed if signer not configured. | Guarantees all queued items must be signed with JWS; HMAC fallback absent. |
| src/attestation/QuarantineManager.js:190‑200 | Logs REJECT event but still uses VERIFY_REASON for outcomes. | No HMAC acceptance. |
**Summary of Findings**
1. Unsigned items are never accepted – both VerifierWrapper.verify and Verifier.verifyQueueItem reject missing signatures outright.
2. No HMAC bypass branches – code contains only explicit rejections of missing signatures and comments indicating HMAC fallback removed.
3. Canonical outcome protocol is used – all results are expressed via VERIFY_REASON constants; no conflicting ACCEPT/REJECT enum.
4. Lane identity is verified before any crypto verification – deterministic flow (A = B = C) enforced in both VerifierWrapper and Verifier.
5. Helper methods – getMigrationStatus reports hmac_accepted:false. The deprecated isHMACAccepted() function does not exist.
All examined code respects the anchor policy (hmac_accepted: false, missing_signature_mode: REJECT). No P0‑level regressions were found.
