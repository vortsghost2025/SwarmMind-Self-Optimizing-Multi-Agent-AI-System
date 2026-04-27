# Delegation Reliability Fix Plan

## 1. Bug Statement

Observed behavior:

- `archivist -> swarmmind` task dispatch succeeds.
- Swarm executes the task and builds `response.to = archivist`.
- Response artifact is written into Swarm lane inbox instead of Archivist inbox in the tested flow.

Impact:

- Delegation appears successful at execution layer but fails at delivery layer.
- Upstream coordinator cannot reliably consume downstream results.
- End-to-end lane contract is violated.

## 2. Affected Path

Primary path:

- `scripts/task-executor.js` response delivery helper (`signAndDeliver`)
- `scripts/swarm-role-runner.js` execution-role environment wiring (`SWARM_ROLE_LOCAL_LOOP`)

Likely failure mode:

- Delivery path selects local/default target under conditions where `response.to` should take priority.
- Local loop mode and/or fallback logic may override intended destination.

## 3. Expected Invariant

Hard invariant:

- **Response delivery target must honor original requester lane.**

Operational form:

- `response.to` must equal original request `from`.
- Physical delivery path must resolve from `response.to` lane mapping.
- Local loop mode is allowed only when explicitly enabled and only for designated local tests.

## 4. Minimal Patch Surface

Patch only delivery resolution logic (no schema or execution logic changes):

1. In `scripts/task-executor.js`:
   - Adjust target resolution in `signAndDeliver`:
     - default: resolve by `response.to` lane mapping.
     - local-loop override: only if `SWARM_ROLE_LOCAL_LOOP=1` **and** explicit local test intent is set.
2. In `scripts/swarm-role-runner.js`:
   - Keep role split behavior unchanged.
   - Ensure local-loop mode is test-scoped and not accidentally used for cross-lane delivery assertions.

Out of scope for this patch:

- lane-worker routing rules
- domain-gate behavior
- schema changes
- ownership policy changes

## 5. Acceptance Tests

Required tests:

1. **Archivist -> Swarm -> Archivist delivery**
   - Send task from Archivist to Swarm.
   - Swarm executes.
   - Assert response lands in `S:/Archivist-Agent/lanes/archivist/inbox`.

2. **Library -> Swarm -> Library delivery**
   - Send task from Library to Swarm.
   - Swarm executes.
   - Assert response lands in `S:/self-organizing-library/lanes/library/inbox`.

3. **Local-loop isolation test**
   - With `SWARM_ROLE_LOCAL_LOOP=1`, assert response lands only in worktree/local Swarm inbox.
   - Without flag, assert cross-lane routing by `response.to`.

4. **Destination integrity check**
   - Assert `response.to === original_request.from`.
   - Assert physical delivery queue lane matches `response.to`.

Pass criteria:

- All four tests pass.
- No regression to existing role-runner smoke flow.

## 6. Rollback Note

If delivery regression appears after patch:

1. Revert delivery resolution changes in `scripts/task-executor.js`.
2. Keep role contract and smoke docs intact.
3. Re-run prior known-good smoke (`governance -> execution -> governance -> verification`).
4. Hold merge until delivery-path tests pass in isolation.

