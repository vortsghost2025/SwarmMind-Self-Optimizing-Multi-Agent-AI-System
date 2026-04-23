# MULTI-PROJECT GIT COORDINATION PROPOSAL

**Date:** 2026-04-17 03:06:16 UTC-4
**Problem:** GitHub sees projects as separate entities, but we operate as unified organism
**Projects:**
- `S:\Archivist-Agent` — Governance registry (authority: 100)
- `S:\SwarmMind Self-Optimizing Multi-Agent AI System` — Execution layer (authority: 80)
- `S:\self-organizing-library` — Index/pattern observatory (authority: 60)

---

## THE PROBLEM

### Current Git Reality

| Project | GitHub Repo | Git Status |
|---------|-------------|------------|
| Archivist-Agent | `vortsghost2025/Archivist-Agent` | Separate repo |
| SwarmMind | `vortsghost2025/SwarmMind-Self-Optimizing-Multi-Agent-AI-System` | Separate repo |
| self-organizing-library | No git repo (not initialized) | Contains SwarmMind as nested .git |

### The Organism Reality

We are **NOT** three separate projects. We are:
- **One governance system** (Archivist provides constitutional constraints)
- **One execution layer** (SwarmMind implements multi-agent coordination)
- **One knowledge index** (self-organizing-library provides cross-references)

GitHub's model assumes:
- Projects are independent
- Commits are isolated
- Repositories don't share runtime state

**Our reality violates GitHub's assumptions.**

---

## OPTIONS ANALYSIS

### Option A: Merge into Monorepo

**Approach:** Single GitHub repo with subdirectories

```
swarmmind-organism/
├── governance/          # Archivist-Agent
├── execution/           # SwarmMind
└── library/             # self-organizing-library
```

**Pros:**
- ✅ Single commit history
- ✅ Cross-project references in one place
- ✅ Unified issue tracking
- ✅ Single CI/CD pipeline

**Cons:**
- ❌ Loses project-specific stars/forks
- ❌ Large repo size (800GB potential)
- ❌ Mixes different release cycles
- ❌ May not want all code public together

**Verdict:** ⚠️ Possible but loses flexibility

---

### Option B: Git Submodules

**Approach:** Archivist as root, others as submodules

```
Archivist-Agent/
├── .gitmodules
├── extensions/
│   └── swarmmind/       # submodule
└── library/             # submodule
```

**Pros:**
- ✅ Preserves separate repos
- ✅ Version locking via submodule commits
- ✅ Can update independently
- ✅ GitHub sees connections

**Cons:**
- ❌ Submodules are notoriously difficult
- ❌ Requires coordinated updates
- ❌ Complex merge conflicts
- ❌ CI/CD complexity

**Verdict:** ⚠️ Technically correct but operationally painful

---

### Option C: Independent Repos with Cross-References (RECOMMENDED)

**Approach:** Keep separate repos, add cross-project metadata

**Implementation:**

1. **Cross-Project Commit Metadata**

Each commit includes metadata linking to related commits in other repos:

```json
// .git-commit-metadata.json (in each repo)
{
  "commit_sha": "abc123",
  "timestamp": "2026-04-17T03:06:16-04:00",
  "cross_project_refs": {
    "archivist-agent": {
      "repo": "vortsghost2025/Archivist-Agent",
      "related_commit": "def456",
      "relationship": "governance-update"
    },
    "swarmmind": {
      "repo": "vortsghost2025/SwarmMind-Self-Optimizing-Multi-Agent-AI-System",
      "related_commit": "ghi789",
      "relationship": "execution-sync"
    }
  },
  "session_id": "1776399805802-28240",
  "coordination_score": "93%"
}
```

2. **Cross-Project Commit Message Convention**

```
[ARCHIVIST] governance: Add checkpoint integration

Cross-project:
- Archivist-Agent: abc123 (governance-update)
- SwarmMind: def456 (execution-sync)
- self-organizing-library: N/A (reference-only)

Session: 1776399805802-28240
Coordination: 93%

Related: vortsghost2025/SwarmMind-Self-Optimizing-Multi-Agent-AI-System#1
```

3. **Cross-Project Issue/PR References**

Use GitHub's cross-repo referencing:
- `vortsghost2025/Archivist-Agent#123` — references Archivist issue
- `vortsghost2025/SwarmMind-Self-Optimizing-Multi-Agent-AI-System#456` — references SwarmMind PR

**Pros:**
- ✅ Preserves separate repos
- ✅ GitHub native (issues, PRs)
- ✅ Flexible release cycles
- ✅ Can keep some private
- ✅ No submodule complexity

**Cons:**
- ⚠️ Requires manual metadata tracking
- ⚠️ No atomic commits across repos
- ⚠️ Need tooling for coordination

**Verdict:** ✅ BEST FIT for our model

---

### Option D: Meta-Repository (Coordinator)

**Approach:** Create a meta-repo that tracks but doesn't contain code

```
swarmmind-ecosystem/
├── README.md           # "This is not code, it's coordination"
├── COORDINATION.json   # Current state of all projects
├── SESSIONS/           # Session logs
├── SYNTHESIS/          # Cross-project reviews
└── GOVERNANCE/         # Constitutional docs (symlinks)
```

**Pros:**
- ✅ Separate coordination layer
- ✅ Can track ecosystem state
- ✅ Doesn't require code merge
- ✅ Can be public while code is private

**Cons:**
- ⚠️ Adds another repo to manage
- ⚠️ Could become outdated
- ⚠️ No direct code linkage

**Verdict:** ✅ GOOD COMPLEMENT to Option C

---

## RECOMMENDED SOLUTION

### Hybrid Approach: Option C + Option D

**1. Keep Projects as Separate GitHub Repos**
- Archivist-Agent stays independent
- SwarmMind stays independent
- self-organizing-library gets initialized as independent repo

**2. Create Cross-Project Metadata**
- Each commit includes cross-project refs
- Use standardized commit message format
- Link issues/PRs across repos

**3. Create Meta-Repository for Coordination**
- New repo: `swarmmind-ecosystem` (or similar name)
- Contains only coordination documents
- Tracks ecosystem state, not code

**4. Implement Session-Based Coordination**
- Each session registers in SESSION_REGISTRY.json
- Commits reference session ID
- Cross-project changes documented in meta-repo

---

## IMPLEMENTATION PLAN

### Phase 1: Standardize Commit Metadata

Create `.git-commit-template.txt` in each repo:

```
[PROJECT] scope: brief description

Cross-project:
- Archivist-Agent: [SHA or N/A]
- SwarmMind: [SHA or N/A]
- self-organizing-library: [SHA or N/A]

Session: [SESSION_ID]
Coordination: [TRUST_SCORE]

Related: [Cross-repo issue/PR references]

[Detailed description]
```

### Phase 2: Create Commit Coordination Script

`scripts/coordinate-commit.js`:

```javascript
#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');

// Read SESSION_REGISTRY
const registry = JSON.parse(fs.readFileSync('S:/Archivist-Agent/SESSION_REGISTRY.json'));

// Get current session
const sessionId = process.env.SESSION_ID || 'unknown';

// Get latest commits from each project
const projects = ['archivist-agent', 'swarmmind', 'self-organizing-library'];
const crossRefs = {};

projects.forEach(project => {
  try {
    const sha = execSync(`git -C "${registry.projects[project].path}" rev-parse HEAD`).toString().trim();
    crossRefs[project] = sha;
  } catch (e) {
    crossRefs[project] = 'N/A';
  }
});

// Generate commit message
console.log(`
Cross-project:
${Object.entries(crossRefs).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Session: ${sessionId}
Coordination: ${registry.coordination_status?.trust_score || 'N/A'}
`);
```

### Phase 3: Create Meta-Repository

**Structure:**
```
swarmmind-ecosystem/
├── README.md
├── ECOSYSTEM_STATE.json
├── SESSIONS/
│   ├── session-1776399805802-28240.md
│   └── session-1776403587854-50060.md
├── SYNTHESIS/
│   ├── CROSS_PROJECT_REVIEW_2026-04-17.md
│   └── FINAL_RECONCILIATION_REPORT.md
├── GOVERNANCE/
│   ├── BOOTSTRAP.md (symlink to Archivist)
│   └── COVENANT.md (symlink to Archivist)
└── REGISTRY/
    ├── SESSION_REGISTRY.json (symlink)
    └── PROJECT_REGISTRY.md (symlink)
```

### Phase 4: GitHub Actions Integration

Create workflow in each repo:

```yaml
# .github/workflows/cross-project-sync.yml
name: Cross-Project Sync

on:
  push:
    branches: [master]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Update ecosystem state
        run: |
          curl -X POST \
            -H "Authorization: token ${{ secrets.ECOSYSTEM_TOKEN }}" \
            -d '{"source": "${{ github.repository }}", "commit": "${{ github.sha }}"}' \
            https://api.github.com/repos/vortsghost2025/swarmmind-ecosystem/dispatches
```

---

## WORKFLOW EXAMPLE

### Developer Makes Changes to SwarmMind

```bash
# 1. Make changes
cd "S:\SwarmMind Self-Optimizing Multi-Agent AI System"
# ... edit files ...

# 2. Generate cross-project commit message
node scripts/coordinate-commit.js > /tmp/commit-msg.txt

# 3. Commit with cross-project metadata
git commit -F /tmp/commit-msg.txt

# 4. Push
git push origin master

# 5. Update meta-repo (automated via GitHub Actions)
# Creates commit in swarmmind-ecosystem linking to this commit
```

### Another Developer Pulls

```bash
# 1. Pull SwarmMind
git pull origin master

# 2. Check cross-project references
git log -1 --pretty=format:"%B" | grep "Cross-project:"

# 3. If changes in Archivist, pull those too
cd "S:\Archivist-Agent"
git pull origin master

# 4. Verify coordination
node scripts/verify-cross-refs.js
```

---

## BENEFITS OF THIS APPROACH

### ✅ Preserves GitHub's Mental Model

- GitHub still sees separate repos
- Issues, PRs, stars work normally
- No forced monorepo

### ✅ Enables Unified Organism

- Cross-project metadata links commits
- Session-based coordination
- Trust scores in commit history

### ✅ Flexible Visibility

- Can keep some repos private
- Public coordination layer
- Selective sharing

### ✅ Future-Proof

- Can migrate to monorepo later if needed
- Can add more projects
- Can automate further

---

## ALTERNATIVE: GIT NOTES

Git has a native feature for attaching metadata to commits without changing the commit:

```bash
# Add cross-project note
git notes add -m "Cross-project: archivist=abc123, swarmmind=def456" HEAD

# Push notes
git push origin refs/notes/*
```

**Pros:**
- ✅ Native Git feature
- ✅ Doesn't change commit SHA
- ✅ Can be pushed separately

**Cons:**
- ⚠️ Not visible in GitHub UI
- ⚠️ Requires git notes knowledge

**Verdict:** Could supplement Option C

---

## RECOMMENDED NEXT STEPS

### Immediate (This Session)

1. ✅ Initialize self-organizing-library as git repo
2. ✅ Create commit template files in all three projects
3. ✅ Create `coordinate-commit.js` script
4. ✅ Document workflow in AGENTS.md

### Near-Term (Next Session)

5. ⬜ Create meta-repository (swarmmind-ecosystem)
6. ⬜ Set up GitHub Actions for cross-project sync
7. ⬜ Test coordinated commit workflow
8. ⬜ Update PROJECT_REGISTRY.md with GitHub links

### Long-Term

9. ⬜ Evaluate monorepo migration
10. ⬜ Consider git notes integration
11. ⬜ Automate cross-project validation
12. ⬜ Create ecosystem dashboard

---

## DECISION NEEDED

**Question for User:**

Do you want to:

A. **Keep separate repos + add cross-project metadata** (Recommended)
B. **Merge into monorepo**
C. **Use git submodules**
D. **Create meta-repo for coordination only**
E. **Hybrid (A + D)**

**My Recommendation:** **Option E (Hybrid)**

- Keeps flexibility of separate repos
- Adds cross-project linking
- Creates coordination layer
- Doesn't force migration

---

**Proposal Complete:** 2026-04-17 03:06:16 UTC-4
**Status:** AWAITING USER DECISION
