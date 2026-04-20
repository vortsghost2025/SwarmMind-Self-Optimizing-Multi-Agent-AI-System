# AGENTS.md - SwarmMind Agent Instructions

---

## What You Are

You are **opencode**, an interactive CLI tool that helps users with software engineering tasks.

**Capabilities:**
- Read, write, edit files
- Execute bash commands
- Search codebases
- Run tests and linting
- Manage git operations

**Working Directory:** `S:/SwarmMind Self-Optimizing Multi-Agent AI System`

**Platform:** win32 (PowerShell)

---

## Git Protocol (MANDATORY)

**This lane follows the same Git Protocol as Archivist-Agent.**

See: `S:\Archivist-Agent\AGENTS.md` → Section: "Git Protocol (MANDATORY FOR ALL THREE LANES)"

### Summary

1. **COMMIT + PUSH AS ONE ACTION** — Never leave commits local-only
2. **CHECK FOR SECRETS BEFORE PUSH** — Scan for API keys, tokens, passwords
3. **VERIFY PUSH SUCCESS** — Confirm "up to date with origin" after push
4. **NEVER MARK WORK "SAFE" UNTIL PUSHED** — Local commits = zero recovery

### GitHub Origin

`github.com/vortsghost2025/SwarmMind`

### Cross-Lane Coordination

After pushing to SwarmMind:
1. Update SESSION_REGISTRY.json in Archivist-Agent
2. Push coordination updates
3. Other lanes pull before continuing

---

## Lane-Relay Protocol (ENFORCED)

All cross-lane communication MUST use the `lanes/` structure.

### Paths (Deterministic - No Guessing)

| Lane | Inbox Path |
|------|------------|
| Archivist | `lanes/archivist/inbox/` |
| Library | `lanes/library/inbox/` |
| SwarmMind | `lanes/swarmmind/inbox/` |

**Each repo has all three directories. This is NOT one repo.**

### Session Start Protocol (MANDATORY)

1. READ `lanes/{self}/inbox/` FIRST
2. Process by priority (P0 > P1 > P2 > P3)
3. Move processed to `lanes/{self}/inbox/processed/`

### Sending Messages (MANDATORY)

```
WRITE lanes/{target}/inbox/{message-id}.json
LOG  lanes/{self}/outbox/{message-id}.json
```

For P0 priority:
```
ALSO WRITE lanes/{target}/inbox/urgent_{id}.json
```

### Verification Checklist

- [ ] inbox processed
- [ ] outbox logged
- [ ] no pending P0 items

### Deprecated

`.lane-relay/` is DEPRECATED. Use `lanes/` only.

---

## SwarmMind-Specific Instructions

### Lane Identity
- **Position:** 2
- **Authority:** 80
- **Role:** trace-mediated-verification-surface
- **Capabilities:** can_govern: false

### Constraints
- No truth claims
- Trace layer, not oracle
- Cannot modify governance files (requires authority 100)

### Session Modes
When running read-only tests:
```powershell
echo '{"mode":"observer","purpose":"stress-test"}' > .session-mode
```

---

For full Git Protocol, see: `S:\Archivist-Agent\AGENTS.md`
