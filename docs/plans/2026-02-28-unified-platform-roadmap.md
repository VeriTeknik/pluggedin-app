# Unified Platform Roadmap: RAG + Memory + Plugin + CBP

**Date:** 2026-02-28
**Status:** Proposed
**Author:** Claude Code + Cem Karaca

---

## Executive Summary

Four interconnected workstreams need to be combined into a phased implementation plan. Each phase builds infrastructure that the next phase depends on:

```
Phase 1: RAG zvec Migration (shared vector infra)
    ↓
Phase 2: Memory System Migration (reuse shared worker)
    ↓
Phase 3: MCP Instructions + Claude Code Plugin
    ↓
Phase 4: Collective Best Practices (CBP)
```

**Current State:**
- Memory system: **95% complete** (schema, services, API, UI all on `feature/long-term-memory-system`)
- MCP memory tools: **Done** (registered on `feature/memory-tools-registration`)
- RAG zvec: **Design approved**, implementation plan written, not started
- Plugin: **Design approved** (sections 1-5), doc not yet written
- CBP: **Concept designed**, not formalized

---

## Phase 1: RAG zvec Migration + Shared Vector Infrastructure

**Goal:** Replace `plugged_in_v3_server` (FastAPI + Milvus) with zvec embedded in pluggedin-app, establishing shared vector infrastructure for both RAG and Memory.

**Duration:** ~2 weeks
**Branch:** `feature/rag-zvec-migration`
**Dependencies:** None (foundational)

### What Gets Built

| Component | Location | Purpose |
|-----------|----------|---------|
| Shared worker thread | `lib/vectors/vector-worker.ts` | Single zvec worker for RAG + Memory |
| Worker service wrapper | `lib/vectors/vector-service.ts` | Async API over worker thread |
| Shared embedding service | `lib/vectors/embedding-service.ts` | Unified OpenAI embedding (text-embedding-3-small) |
| Shared types | `lib/vectors/types.ts` | Common vector operation types |
| Text chunking | `lib/rag/chunking.ts` | RAG-specific text splitting |
| RAG service rewrite | `lib/rag-service.ts` | HTTP client -> worker thread wrapper |
| `document_chunks` table | `db/schema.ts` | Chunk text storage + zvec references |
| Unified Docker Compose | `docker-compose.yml` | pgvector:pg18 + zvec volumes |
| Dockerfile update | `Dockerfile` | zvec native deps + data dirs |

### Key Design Decision: Shared `lib/vectors/`

Instead of separate vector infrastructure for RAG (`lib/rag/rag-worker.ts`) and Memory (`lib/memory/vector-service.ts`), create a unified layer:

```
lib/vectors/                     ← NEW shared infrastructure
├── vector-worker.ts             ← Single worker thread (zvec + pgvector bridge)
├── vector-service.ts            ← Async wrapper (postMessage/await)
├── embedding-service.ts         ← Unified embeddings (text-embedding-3-small)
└── types.ts                     ← Common types

lib/rag/                         ← RAG-specific (uses lib/vectors/)
├── chunking.ts                  ← Text splitting
└── types.ts                     ← RAG domain types

data/vectors/                    ← Unified data path
├── rag/{project_uuid}/          ← RAG collections
└── memory/{profile_uuid}/       ← Memory collections (Phase 2)
```

**Embedding model:** Unify on `text-embedding-3-small` (1536 dim) for both RAG and Memory. The current RAG plan uses `text-embedding-ada-002` - update to newer model.

### Tasks (13 from existing plan, modified for shared infra)

1. Install dependencies (`@zvec/zvec`, `openai`)
2. Create shared vector types (`lib/vectors/types.ts`)
3. Add `document_chunks` table to schema
4. Create text chunking service (`lib/rag/chunking.ts`)
5. Create shared embedding service (`lib/vectors/embedding-service.ts`)
6. Create zvec worker thread (`lib/vectors/vector-worker.ts`)
7. Create vector service wrapper (`lib/vectors/vector-service.ts`)
8. Rewrite RAG service (`lib/rag-service.ts`)
9. Update server actions (`app/actions/library.ts`)
10. Verify API routes backward compatibility
11. Update Dockerfile for zvec native deps
12. Update Docker Compose (pgvector:pg18, zvec volumes)
13. Cleanup env vars (`RAG_API_URL` -> `ZVEC_DATA_PATH`)

### Verification
- All existing RAG tests pass
- New unit tests for vector worker, chunking, embeddings
- `pnpm build` succeeds
- Docker Compose starts cleanly
- RAG upload/query flow works end-to-end

---

## Phase 2: Memory System Migration to Shared Infrastructure

**Goal:** Migrate the memory system's vector operations from direct pgvector SQL to the shared `lib/vectors/` worker thread. Merge the memory feature branch.

**Duration:** ~1 week
**Branch:** `feature/memory-shared-vectors` (based on Phase 1)
**Dependencies:** Phase 1 complete

### What Changes

| Current (lib/memory/) | New (using lib/vectors/) |
|------------------------|--------------------------|
| `vector-service.ts` (380 lines, direct SQL) | Import from `lib/vectors/vector-service.ts` |
| `embedding-service.ts` (52 lines, OpenAI direct) | Import from `lib/vectors/embedding-service.ts` |
| `data/memory-vectors/` data path | `data/vectors/memory/` unified path |
| `text-embedding-3-small` model | Same (already aligned) |

### Tasks

1. **Migrate memory vector operations** - Replace `lib/memory/vector-service.ts` with calls to `lib/vectors/vector-service.ts`
2. **Migrate memory embeddings** - Replace `lib/memory/embedding-service.ts` with calls to `lib/vectors/embedding-service.ts`
3. **Update data paths** - `MEMORY_VECTOR_DATA_DIR` -> unified `ZVEC_DATA_PATH` + `/memory/` subdirectory
4. **Update constants.ts** - Remove duplicate embedding config
5. **Route LLM calls through Model Router** - Replace hardcoded OpenAI calls in analytics-agent.ts, z-report-service.ts, gut-agent.ts
6. **Run memory test suite** - Verify no regressions
7. **Merge feature branches** - Combine `feature/long-term-memory-system` + `feature/memory-tools-registration` + Phase 1 work

### Verification
- Memory API endpoints return correct results
- Memory search (vector + text + gut) works
- Z-report generation works
- Decay engine processes correctly
- `pnpm build` succeeds
- All branches cleanly merged

---

## Phase 3: MCP Server Instructions + Claude Code Plugin

**Goal:** Two complementary pieces: (A) Add `instructions` field to MCP server so every client gets baseline guidance, and (B) Create the `pluggedin` Claude Code plugin for deep integration.

**Duration:** ~2 weeks
**Branch:** `feature/mcp-instructions` + new repo `VeriTeknik/claude-plugins`
**Dependencies:** Phase 2 complete (memory + RAG unified)

### Part A: MCP Server Instructions

Add ~250 words to the `Server()` constructor in `pluggedin-mcp/src/mcp-proxy.ts`:

```typescript
const server = new Server(
  { name: "PluggedinMCP", version: packageJson.version },
  {
    capabilities: { prompts: {}, resources: {}, tools: {} },
    instructions: `You are connected to Plugged.in, an AI infrastructure platform...`
  }
);
```

**Content covers:**
- Available tool categories (Discovery, Knowledge Base, Clipboard, Memory, Documents, Notifications)
- Memory workflow (session start -> observe -> search -> session end)
- Progressive disclosure pattern (search -> timeline -> details)
- Best practices (auto-observe errors/decisions, search before asking)

### Part B: Claude Code Plugin (`pluggedin`)

**Repository:** `VeriTeknik/claude-plugins` (marketplace monorepo)

```
plugins/pluggedin/
├── .claude-plugin/
│   ├── plugin.json              ← manifest (name, version, author)
│   └── marketplace.json         ← marketplace metadata
├── skills/
│   ├── memory-workflow/SKILL.md ← Session lifecycle guidance
│   ├── memory-extraction/SKILL.md ← Smart observation capture
│   ├── rag-context/SKILL.md     ← RAG search integration
│   └── platform-tools/SKILL.md  ← Full tool catalog
├── agents/
│   ├── memory-curator.md        ← Background memory classification
│   └── focus-assistant.md       ← Working set management
├── commands/
│   ├── memory-status.md         ← /pluggedin:memory-status
│   ├── memory-search.md         ← /pluggedin:memory-search
│   ├── memory-forget.md         ← /pluggedin:memory-forget
│   ├── pluggedin-status.md      ← /pluggedin:status
│   └── setup.md                 ← /pluggedin:setup (API key config)
├── hooks/
│   ├── hooks.json               ← Hook definitions
│   ├── session-start.sh         ← SessionStart: auto-start memory session
│   ├── pre-compact.sh           ← PreCompact: inject relevant memories
│   └── session-end.sh           ← SessionEnd: end session + Z-report
└── .mcp.json                    ← Wraps pluggedin-mcp-proxy
```

### Tasks

1. Add `instructions` field to MCP server constructor
2. Create marketplace repo structure
3. Write `plugin.json` manifest
4. Write `/pluggedin:setup` command (API key onboarding)
5. Write `session-start.sh` hook (auto-start memory session)
6. Write `pre-compact.sh` hook (inject relevant memories)
7. Write `session-end.sh` hook (end session + Z-report)
8. Write `memory-workflow` skill
9. Write `memory-extraction` skill
10. Write `rag-context` skill
11. Write `platform-tools` skill
12. Write `memory-curator` agent
13. Write `focus-assistant` agent
14. Write remaining commands
15. Write `.mcp.json` for pluggedin-mcp wrapping
16. Test plugin installation + hooks

### Verification
- Plugin installs via `claude plugin add VeriTeknik/claude-plugins/plugins/pluggedin`
- `/pluggedin:setup` guides API key configuration
- SessionStart hook starts memory session
- PreCompact hook injects relevant memories
- SessionEnd hook generates Z-report
- Skills load correctly on invocation
- MCP instructions appear in client system prompts

---

## Phase 4: Collective Best Practices (CBP)

**Goal:** Evolve `gut_patterns` into a full collective intelligence system - digital collective unconscious with privacy-preserving pattern aggregation.

**Duration:** ~2 weeks
**Branch:** `feature/collective-best-practices`
**Dependencies:** Phase 3 complete (plugin hooks for data capture)

### New Tables

| Table | Purpose |
|-------|---------|
| `collective_patterns` | Enhanced gut_patterns with pgvector embedding, scoring, lifecycle |
| `collective_contributions` | Anonymous contribution tracking (k-anonymity) |
| `collective_feedback` | User feedback on pattern quality |

### Promotion Pipeline

```
Memory Ring (individual) → Eligibility Check → PII Strip → Generalize (LLM) →
Dedup (cosine ≥ 0.90) → Confidence Score → collective_patterns
```

### Injection Engine

Proactive pattern delivery based on context:
- **Proactive warning** - Before tool calls with known pitfalls
- **Post-error suggestion** - After error patterns match collective knowledge
- **Contextual enrichment** - During search when collective patterns are relevant

### Pattern Types

`error_solution`, `anti_pattern`, `best_practice`, `gotcha`, `migration_note`, `compatibility`, `performance_tip`, `security_warning`

### Tasks

1. Add `collective_patterns` table to schema (enhanced from `gut_patterns`)
2. Add `collective_contributions` table
3. Add `collective_feedback` table
4. Create promotion service (`lib/memory/cbp/promotion-service.ts`)
5. Create injection engine (`lib/memory/cbp/injection-engine.ts`)
6. Create anonymizer (`lib/memory/cbp/anonymizer.ts`)
7. Add CBP API endpoints
8. Add CBP server actions
9. Add `PostToolUse` hook to plugin for error detection
10. Update Memory UI with CBP tab
11. Add CBP translations (6 languages)
12. Weekly aggregation cron endpoint

### Verification
- Promotion pipeline correctly strips PII
- k-anonymity (k=3) enforced
- Injection engine returns relevant patterns
- Feedback loop updates confidence scores
- Plugin hook captures error patterns

---

## Cross-Phase Architecture

### Shared Vector Infrastructure (Phase 1, used by all)

```
lib/vectors/
├── vector-worker.ts        ← Single worker thread
├── vector-service.ts       ← Async wrapper
├── embedding-service.ts    ← Unified embeddings
└── types.ts

data/vectors/
├── rag/{project_uuid}/     ← RAG document vectors
├── memory/{profile_uuid}/  ← Memory vectors
└── cbp/                    ← Collective pattern vectors
```

### Embedding Model (Unified)

All systems use `text-embedding-3-small` (1536 dimensions) via `lib/vectors/embedding-service.ts`.

### Docker Compose (Unified)

```yaml
services:
  app:
    volumes:
      - zvec-data:/app/data/vectors    # RAG + Memory + CBP
    environment:
      ENABLE_RAG: "true"
      ZVEC_DATA_PATH: /app/data/vectors

  postgres:
    image: pgvector/pgvector:pg18      # pgvector for Memory + CBP
```

---

## Risk Register

| Risk | Phase | Likelihood | Impact | Mitigation |
|------|-------|-----------|--------|------------|
| zvec Node.js bindings break (pre-1.0) | 1 | Medium | High | Pin version, monitor releases |
| Worker thread memory leaks | 1,2 | Low | Medium | Health checks, periodic restart |
| Shared worker becomes bottleneck | 2 | Low | Medium | Separate workers per domain if needed |
| Plugin marketplace not yet live | 3 | Medium | Low | Direct install via git URL |
| CBP PII leakage | 4 | Low | High | Multi-stage anonymization, LLM review |
| OpenAI API cost spike | 1,2,4 | Medium | Medium | Rate limiting, budget alerts |

---

## Environment Variables (All Phases)

```bash
# Phase 1: RAG
ENABLE_RAG=true
ZVEC_DATA_PATH=./data/vectors
OPENAI_API_KEY=xxx                    # For embeddings

# Phase 2: Memory (existing, no new vars needed)
MEMORY_EMBEDDING_MODEL=text-embedding-3-small
MEMORY_DECAY_CRON_ENABLED=true

# Phase 3: Plugin
PLUGGEDIN_API_KEY=pg_in_xxx           # User's API key (in ~/.claude/settings.local.json)

# Phase 4: CBP
CBP_PROMOTION_ENABLED=true
CBP_K_ANONYMITY_THRESHOLD=3
CBP_AGGREGATION_CRON_ENABLED=true
```

---

## Timeline Summary

| Phase | Scope | Est. Duration | Depends On |
|-------|-------|---------------|------------|
| **1** | RAG zvec + shared vectors | 2 weeks | - |
| **2** | Memory migration | 1 week | Phase 1 |
| **3** | MCP instructions + Plugin | 2 weeks | Phase 2 |
| **4** | CBP system | 2 weeks | Phase 3 |
| **Total** | | ~7 weeks | |

---

## Files Impact Summary

| Phase | New Files | Modified Files | Repos |
|-------|-----------|----------------|-------|
| 1 | ~10 | ~6 | pluggedin-app |
| 2 | 0 | ~5 | pluggedin-app, pluggedin-mcp |
| 3 | ~20 | ~2 | pluggedin-mcp, claude-plugins (new) |
| 4 | ~8 | ~4 | pluggedin-app |
| **Total** | **~38** | **~17** | **3 repos** |
