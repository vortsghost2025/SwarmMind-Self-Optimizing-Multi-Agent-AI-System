# Swarm Role Contract (Draft v1)

## Purpose

Split SwarmMind responsibilities into explicit operational roles so the lane can scale safely under concurrency without mixing governance, execution, and verification concerns.

## Roles

### 1) `governance`
- **Primary responsibility:** intake validation and routing.
- **Allowed actions:** schema/signature checks, ownership evaluation, queue routing.
- **Disallowed actions:** task execution logic and response truth classification beyond routing metadata.
- **Script surface:** `scripts/lane-worker.js`.

### 2) `execution`
- **Primary responsibility:** execute actionable work from `action-required`.
- **Allowed actions:** run bounded executor verbs and emit signed responses.
- **Disallowed actions:** inbox governance routing decisions and policy mutation.
- **Script surface:** `scripts/generic-task-executor.js`.

### 3) `verification`
- **Primary responsibility:** verify output-state integrity and summarize truth posture.
- **Allowed actions:** inspect processed/blocked/quarantine response artifacts and produce verification summaries.
- **Disallowed actions:** mutate queues or execute new tasks.
- **Script surface:** `scripts/swarm-role-runner.js --role verification`.

## Handoff Model

1. `governance` routes incoming messages.
2. `execution` processes only `action-required`.
3. `governance` routes generated responses from inbox to processed/blocked/quarantine.
4. `verification` audits resulting response posture and emits summary.

## Safety Constraints

- One active writer per role surface at a time.
- Ownership metadata should be present for actionable cross-lane tasks.
- No role may bypass queue boundaries.
- Verification role is read-only against queue contents.

## Success Criteria

- Role invocations are deterministic and independently runnable.
- Execution load no longer requires governance runner context.
- Verification can report health/truth posture without mutating runtime state.

