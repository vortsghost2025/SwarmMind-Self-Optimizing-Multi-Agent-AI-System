# Reference: self-organizing-library (Lane 3, Authority 60)

**Role:** Verification Lane R (Operational) + Knowledge Graph & Persistent Memory  
**Repository:** github.com/vortsghost2025/self-organizing-library  
**Mission:** Serve as documentation hub, pattern indexer, and formal verification layer for the three-lane organism.

---

## Quick Summary

self-organizing-library is **Lane 3** — the verification and memory layer (**Lane R**) of the three-lane constitutional governance system. It ingests documents, builds a NexusGraph knowledge graph with bi-directional citations, and performs independent verification that Lane 2 (SwarmMind) complies with Lane 1 (Archivist) specifications.

**It is the memory that outlives any single session.**

---

## Key Responsibilities

| Responsibility | Implementation | Files |
|----------------|----------------|-------|
| Documentation hub | Centralized library of 5000+ documents | `library/docs/` |
| Knowledge graph | NexusGraph — auto-linking, vector search, graph viz | `SPEC.md`, Drizzle schema |
| Pattern indexing | Cross-reference Rosetta Stone patterns → files → papers | `QUICK_LOOKUP_INDEX.md` |
| Operational verification | Validates Lane 2 compliance with Lane 1 specs | `FORMAL_VERIFICATION_GATE_*.md` |
| Translation layer | Distills 37,000-word academic papers into operational tools | `IMPLEMENTATION_COMPASS.md`, `PATTERN_DECISION_TREE.md` |
| Governance proposal queue | Holds cross-lane amendment proposals for approval | `library/docs/pending/INDEX.md` |
| Books assembly | Compiles architecture docs into readable books | `books/` |

---

## The NexusGraph Knowledge Layer

**Purpose:** Create a persistent, queryable memory that survives crashes, sessions, and agent replacements.

- **Ingestion:** 5000+ documents from internal repos + external sources (GitHub, Medium, DOI, Twitter)
- **Cross-linking:** Bi-directional citations with `[[doc-id]]` syntax
- **Vector search:** Semantic similarity lookup across entire corpus
- **Graph visualization:** Interactive topology maps of connected documents
- **Collections:** Topic-based groupings (Rosetta Stone, WE4FREE, etc.)

**Schema highlights:**
- Documents → Topics (many-to-many)
- Documents → Citations (self-referential)
- Sources → Documents (track provenance)
- Collections → Documents

---

## Relationship to Other Lanes

### Lane 1 (Archivist-Agent, A=100): Governance Root

| Interaction | Direction | Mechanism |
|-------------|-----------|-----------|
| Policy source | Archivist → Library | `FILE_OWNERSHIP_REGISTRY.json`, constitutional stack |
| Lane L expectations | Archivist → Library | `VERIFICATION_LANES.md`, `CHECKPOINTS.md` |
| Verification reports | Library → Archivist | `FORMAL_VERIFICATION_GATE_PHASE2.md` + future automated reports |
| Approval decisions | Archivist → Library | Sync via `SESSION_REGISTRY.json`, lane-relay/ (future) |
| Write access | Archivist → Library files | Authority 100 can write anywhere |

**Library is governed by Archivist** — must respect `BOOTSTRAP.md`, `GOVERNANCE.md`, `COVENANT.md`.

### Lane 2 (SwarmMind, A=80): Execution Layer

| Interaction | Direction | Mechanism |
|-------------|-----------|-----------|
| Execution traces | SwarmMind → Library | Library independently ingests SwarmMind outputs/logs (no direct coupling) |
| Verification subject | Library → SwarmMind | Checks compliance with Archivist's Lane L specs |
| Cross-lane writes | SwarmMind → Library | ❌ BLOCKED by `LaneContextGate` (SwarmMind authority 80 < 100) |
| Data flow | One-way (SwarmMind → external) → Library ingests separately | No shared filesystem writes |

**Library does not modify SwarmMind's output.** It observes and verifies.

---

## Verification Role (Lane R)

**Lane L (Archivist)** = Structural: "What should verification check?"  
**Lane R (Library)** = Operational: "Does implementation actually comply?"

**Example: Phase 2 Cross-Lane Gate**

1. Archivist publishes `SPEC_AMENDMENT_LANE_CONTEXT_GATE.md` — requires cross-lane write enforcement
2. Library evaluates SwarmMind implementation against that spec
3. Library produces `FORMAL_VERIFICATION_GATE_PHASE2.md`:
   - ✅ Cross-lane writes blocked? PASS
   - ✅ HOLD state triggers? PASS
   - ⚠️ `FILE_OWNERSHIP_REGISTRY.json` schema compliance? CONDITIONAL (requires Archivist approval)
4. Library verdict: **CONDITIONAL PASS** — implementation sound, governance sign-off pending
5. Archivist reviews and approves/rejects

**Result:** Two-lane consensus mechanism prevents either lane from unilaterally approving changes.

---

## The Rosetta Stone Papers (WE4FREE Framework)

Theoretical foundation, housed in `Archivist-Agent/papers/` (37,000 words compressed into operational tools):

| Paper | Title | Library distillation |
|-------|-------|---------------------|
| Paper 1 | The Rosetta Stone | `IMPLEMENTATION_COMPASS.md` — rule definitions |
| Paper 2 | Constraint Lattices | `FILE_OWNERSHIP_REGISTRY_SYNC_MODEL.md` — ownership propagation |
| Paper 3 | Phenotype Selection | `PATTERN_DECISION_TREE.md` — 8 decision flowcharts |
| Paper 4 | Drift & Ensemble Coherence | `QUICK_LOOKUP_INDEX.md` — architecture cross-reference |
| Paper 5 | WE4FREE Framework | Applied throughout verification protocols |

**OSF Repository:** https://osf.io/n3tya

---

## Document Structure (`library/docs/`)

```
library/docs/
├── archivist/           # Governance root quick reference
│   └── ARCHIVIST_QUICK_REFERENCE.md
├── failure-modes/       # Named failure modes with patterns & fixes
│   └── SELF_STATE_ALIASING_FAILURE_MODE.md
├── papers/              # Rosetta Stone papers & distillations
│   └── CAISC_CONTRIBUTION_SELF_STATE_ALIASING.md
├── pending/             # Governance approval queue
│   └── INDEX.md
├── specs/               # Technical specifications
│   ├── IMPLEMENTATION_COMPASS.md
│   ├── PATTERN_DECISION_TREE.md
│   ├── QUICK_LOOKUP_INDEX.md
│   ├── FILE_OWNERSHIP_REGISTRY_SYNC_MODEL.md
│   ├── SESSION_REGISTRY_SCHEMA_V2.md
│   └── SESSION_MODE_TEMPLATE.md
├── verification/        # Formal verification reports
│   └── FORMAL_VERIFICATION_GATE_PHASE2.md
└── books/               # Assembled from architecture
    ├── Book1_The_WE4FREE_Gift/
    ├── Book2_The_Rosetta_Stone_for_AI_Systems/
    ├── Book3_The_Drift_Chronicles/
    ├── Book4_Architecting_the_Ensemble/
    └── Book5_From_Trading_to_Air_Traffic_Control/
```

**External source connectors** (not stored in docs): GitHub repos, Medium articles, DOI papers, Twitter threads → harvested, normalized, indexed.

---

## Tech Stack

- **Next.js 16** with App Router
- **Drizzle ORM** with SQLite
- **Tailwind CSS 4**
- **TypeScript 5.9**
- **Bun** (package manager / runtime)

Designed for **massive ingestion** (5000+ documents) with **bi-directional linking** and **vector search** over structured + unstructured content.

---

## Getting Started

```bash
cd "S:\self-organizing-library"
bun install
bun run db:generate        # Generate migrations from schema
bun run db:migrate         # Apply to SQLite
bun run dev                # Start dev server
```

Routes:
- `/library` — document browser, collections, search
- `/graph` — interactive NexusGraph topology visualization
- `/sources` — external source connector management

---

## Key Documents to Read

### In Archivist-Agent (Governance)
- `BOOTSTRAP.md` — Single entry point, organism definition
- `GOVERNANCE.md` — Laws, invariants, checkpoints
- `VERIFICATION_LANES.md` — L + R dual verification protocol
- `FILE_OWNERSHIP_REGISTRY.json` — Lane boundaries & cross-lane policy

### In SwarmMind (Execution)
- `SESSION_ID_FRAGMENTATION_FIX.md` — Session sync protocol
- `ARCHIVIST_HALLUCINATION_ANALYSIS.md` — Cross-lane write gap incident

### In Library (Verification + Memory)
- `FORMAL_VERIFICATION_GATE_PHASE2.md` — Phase 2 compliance report
- `SPEC.md` — NexusGraph feature specification
- `IMPLEMENTATION_COMPASS.md` — WE4FREE operational rules
- `PATTERN_DECISION_TREE.md` — Decision logic for all 8 failure modes
- `QUICK_LOOKUP_INDEX.md` — Pattern→file→paper cross-reference
- `library/docs/pending/INDEX.md` — Current governance proposals

---

## Limits & Future Work

**Current:**
- Web app UI; no direct fs enforcement yet (Phase 3 candidate)
- Verification reports are human-written; automated CI checks pending (Phase 3)
- Cross-lane coordination via Archivist `SESSION_REGISTRY.json` only; no direct messaging

**Future (Phase 3+):**
- OS-level sandbox enforcement (separate processes)
- Automated verification CI pipelines
- Cross-lane messaging bus (lane-relay daemon)
- Read-only enforcement mode (Library guards own files)

---

## Quick Facts

| Attribute | Value |
|-----------|-------|
| Authority | 60 (Lane R) |
| Position | Memory Layer, Verification Lane |
| Key Feature | NexusGraph (5000+ doc ingestion, auto-link) |
| Citation Syntax | `[[doc-id]]` (bi-directional) |
| Verification | Independent compliance assessment (Lane R) |
| Default write ownership | Archivist (100) unless explicitly owned |
| Session state | Holds separate `.session-lock` when launched |
| Cross-lane write | Blocked for Archivist (100) and SwarmMind (80) |

---

## For Contributors

**Adding a document:**
1. Place in `library/docs/[category]/` or connect via external source
2. Ensure at least one citation to existing docs (builds graph)
3. Update `INDEX.md` in that category if needed
4. If proposing governance change → route via `pending/` for Archivist approval

**Running verification:**
```bash
# Not yet automated; see pending/INDEX.md for manual reports
cat library/docs/verification/FORMAL_VERIFICATION_GATE_PHASE2.md
```

**Understanding patterns:**
Start with `IMPLEMENTATION_COMPASS.md` (WE4FREE rules), then `PATTERN_DECISION_TREE.md` (flowcharts), then `QUICK_LOOKUP_INDEX.md` (cross-reference).

---

## Final Word

**Library is the organism's persistent memory.** Without it, each session forgets everything. It transforms transient execution traces into durable knowledge, making the multi-agent ecosystem evolvable rather than ephemeral.

It verifies, indexes, links, and remembers — so that every generation of agents stands on the shoulders of those that came before.

---

*This reference document is part of SwarmMind's internal documentation. For full source, see the self-organizing-library repository directly.*
