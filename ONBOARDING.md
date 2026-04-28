# Onboarding New Lanes

## Quick Start
1. Create your lane root directory (e.g., `S:/my-lane/`).
2. Add `.identity/private.pem` and `.identity/public.pem` (use existing identity tools).
3. Create a `lane-info.json` similar to existing lane examples.
4. Register your lane in the Archivist `lane-registry.json`.
5. Add your outbox and inbox paths to the registry and ensure permissions.

## Required Files
- `lane-info.json` (lane metadata)
- `.identity/private.pem`, `.identity/public.pem`
- Optional: `lane-worker` configuration if running workers.

## Testing Your Lane
- Use `create-signed-message.js` to produce signed test messages.
- Validate with `outbox-write-guard.js guard <file>`.
- Ensure your worker (if any) respects `manual_cadence` during debugging.

## Cross-Lane Communication
- Send messages to other lanes by writing signed JSON to their inbox.
- Always include `id`, `from`, `to`, `signature`, `key_id`, and `lease`.
- Log copies in your outbox for audit.
