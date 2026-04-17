# AGENTS.md - SwarmMind Agent Instructions

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
