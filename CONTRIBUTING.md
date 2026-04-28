# Contributing

## Lane Workflow
- Make changes in your lane workspace (e.g., `S:/SwarmMind/`).
- Use signed JSON messages for cross-lane communication (`create-signed-message.js`).
- Prefer small, focused PRs with clear `task_id` and `idempotency_key`.
- Run tests locally before submitting (`npm test` or `make test`).

## Commit Conventions
- Prefix commits with lane when relevant: `[SwarmMind] fix: ...`
- Reference task IDs in commit bodies when applicable.
- Do not commit secrets or `.env` files.

## Code Review
- Ensure signatures and schema compliance for cross-lane payloads.
- Verify that tests pass and no new lint errors are introduced.
- Add or update documentation for any user-facing changes.

## Testing
- Unit tests should cover new logic; integration tests for cross-lane flows.
- Use the existing lane-worker harness to test message routing.

## Security
- Report vulnerabilities privately via the Archivist lane issue tracker.
- Rotate keys according to SECURITY.md guidance.
