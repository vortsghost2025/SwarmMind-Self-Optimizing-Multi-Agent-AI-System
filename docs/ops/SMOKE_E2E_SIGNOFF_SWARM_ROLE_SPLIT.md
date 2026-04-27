# SMOKE E2E Signoff: Swarm Role Split

## Branch / Worktree

- **Branch:** `feat/swarm-role-split`
- **Worktree:** `S:/SwarmMind/worktrees/swarm-role-split`
- **Execution mode:** apply-mode smoke in quarantine worktree (no broad rollout)

## Exact Flow

`dispatch(seed) -> governance pre-check -> execution(apply) -> governance post-check -> verification`

Smoke sequence executed:
1. Seeded one invalid pre-exec task and one valid actionable task (both signed as `archivist`).
2. Ran governance role in apply mode (pre-check routing).
3. Ran execution role in apply mode.
4. Ran governance role in apply mode (post-check classification).
5. Ran verification role summary.

## Artifacts

- `tmp/smoke-governance-pre.json`
- `tmp/smoke-execution.json`
- `tmp/smoke-governance-post.json`
- `tmp/smoke-verification.json`

## Pass Criteria

| Criteria | Result | Evidence |
|---|---|---|
| 1. Governance blocks invalid pre-execution task | PASS | `smoke-governance-pre.json` route for `smoke-invalid-preexec-1` => `blocked`, reason `FAKE_COMPLETION_PROOF` |
| 2. Execution role runs valid actionable task | PASS | `smoke-execution.json` => scanned `1`, executed `1`, emitted response artifact |
| 3. Verification/governance classifies post-execution result | PASS | `smoke-governance-post.json` route => `INVALID_DOMAIN_POST_EXECUTION`, `verification_outcome=INVALID_DOMAIN` |
| 4. No role writes outside declared scope | PASS | execution response delivered into worktree inbox path under `.../worktrees/swarm-role-split/lanes/swarmmind/inbox/...` |
| 5. Every proof-bearing path has `domain_gate_executed === true` | PASS | post-check route is proof-bearing (`has_completion_proof=true`) and `domain_gate_executed=true` |

## Fix Discovered During Smoke

### Issue
Execution role was initially wired to `generic-task-executor.js`, which uses absolute lane roots and therefore did not consistently honor worktree-local queue behavior.

### Fix Applied
- Switched role-runner execution role tool to `task-executor.js`.
- Added local-loop delivery behavior for role-runner execution path:
  - `SWARM_ROLE_LOCAL_LOOP=1` in role runner process environment.
  - `task-executor.js` now supports local-loop inbox delivery when this env var is present.

### Outcome
Execution writes and routing behavior remained confined to worktree queue surfaces during smoke.

## Merge Recommendation

**APPROVE WITH CAUTION**

Rationale:
- Apply-mode E2E smoke passed across governance/execution/verification role boundaries.
- Role split behavior is still new and should remain feature-flagged / worktree-proven before broad rollout.

## Rollback Note

If rollout issues appear:
1. Revert role-runner adoption and continue with baseline lane-worker + existing executor flow.
2. Disable local-loop role execution path by removing `SWARM_ROLE_LOCAL_LOOP` usage.
3. Keep role contract doc for future staged rollout, but gate runtime adoption behind explicit enablement.

