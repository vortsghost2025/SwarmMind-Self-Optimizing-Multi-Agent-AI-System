# Security Policy

## Vulnerability Reporting
Report security vulnerabilities to the Archivist lane via private issue or encrypted message. Do not create public GitHub issues for active vulnerabilities.

## Key Management
- Private keys are stored in `<lane-root>/.identity/private.pem`. Never commit these.
- Key rotation should be coordinated across lanes. Use `deriveKeyId` to generate new key IDs.
- Passphrases should be provided via `LANE_KEY_PASSPHRASE` or `.runtime/lane-passphrases.json` (never commit).

## Signing Requirements
- All cross-lane messages must be signed (RS256). Use `scripts/create-signed-message.js`.
- Verify signatures with `outbox-write-guard.js` before processing.

## Incident Response
1. Revoke compromised keys immediately.
2. Notify all lanes via broadcast channel.
3. Rotate keys and redistribute public keys via trusted channel.
