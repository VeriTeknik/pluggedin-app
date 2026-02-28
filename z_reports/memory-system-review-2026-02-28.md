# Memory System Branch Review Report

**Branch**: `feature/long-term-memory-system`
**Date**: 2026-02-28
**Base**: `main` (37023188)
**Scope**: 48 files changed, +17,817 / -107 lines

---

## 1. Branch Overview

### What Was Built

A full long-term memory system inspired by human cognition, implementing a 5-layer cognitive architecture:

| Layer | Implementation | File(s) |
|-------|---------------|---------|
| Focus Agent | Working set management (7-9 items) | `lib/memory/focus-agent.ts` |
| Fresh Memory | Observation buffer with TTL | `lib/memory/observation-service.ts` |
| Analytics Agent | LLM-powered classification | `lib/memory/analytics-agent.ts` |
| Memory Ring | 4-segment long-term storage | `lib/memory/decay-engine.ts`, `lib/memory/retrieval-service.ts` |
| Gut Agent | Cross-profile collective wisdom | `lib/memory/gut-agent.ts` |

### File Inventory

| Category | Files | Lines Added |
|----------|-------|-------------|
| Database schema | 1 (schema.ts edit) | +327 |
| Migration | 2 (SQL + snapshot) | +11,123 |
| Core services | 12 (lib/memory/*.ts) | +2,752 |
| Server actions | 1 (app/actions/memory.ts) | +459 |
| API routes | 13 (app/api/memory/**) | +1,002 |
| UI components | 3 (tabs) + 1 (main edit) | +1,095 |
| UI hooks | 4 | +288 |
| Translations | 6 (en, tr, zh, hi, ja, nl) | +594 |
| Config | 2 (next.config.ts, package.json) | +4 |
| **Total** | **48** | **~17,817** |

### Dependencies Added

- `@zvec/zvec` ^0.2.1 - Alibaba's in-process vector database (N-API native)
- Added to `serverExternalPackages` in next.config.ts to prevent webpack bundling

---

## 2. Implementation Status

| Phase | Component | Status | Notes |
|-------|-----------|--------|-------|
| **Phase 1** | Database Schema | COMPLETE | 4 tables: memory_sessions, fresh_memory, memory_ring, gut_patterns |
| **Phase 2** | Core Services | COMPLETE | Session, observation, embedding, vector services |
| **Phase 3** | Analytics Agent + Z-Reports | COMPLETE | LLM classification, Z-report generation |
| **Phase 4** | Decay Engine + Retrieval | COMPLETE | 5-stage decay, 3-layer progressive retrieval |
| **Phase 5** | Gut Agent | COMPLETE | k-anonymity (k=3), SHA-256 pattern hashing |
| **Phase 6** | API Routes + Server Actions | COMPLETE | 13 routes, 15+ server actions |
| **Phase 7** | MCP Tools | PARTIAL | Tools defined but NOT registered (see Critical Gap #1) |
| **Phase 8** | UI Components | COMPLETE | 3 tabs populated (Long-term, Procedures, Fresh) |

### Build Status

- Build: PASSING (exit 0)
- Tests: 41 failures (same as main - no new regressions)
- Migration: Applied successfully (drizzle/0090_naive_callisto.sql)

---

## 3. Schema Compliance

### Tables Created (4/4 from plan)

| Table | Columns | Compliance | Issues |
|-------|---------|------------|--------|
| `memory_sessions` | 13 | FULL | All planned columns present |
| `fresh_memory` | 15 | PARTIAL | Missing: `novelty_hash`, `salience_score`, `language_code`, `pii_detected`, `consent_level` |
| `memory_ring` | 22 | FULL | All planned columns present including decay stages |
| `gut_patterns` | 13 | FULL | All planned columns present |

### Schema Conventions (per CLAUDE.md)

| Rule | Status |
|------|--------|
| varchar for enums (not pgEnum) | PASS - uses varchar(20/30) |
| UUID primary keys | PASS - uuid PK with defaultRandom |
| profile_uuid FK scoping | PASS - all tables scoped by profile_uuid |
| timestamp with timezone | PASS - uses timestamp with mode 'date' |
| Drizzle migration workflow | PASS - pnpm db:generate + db:migrate |

### Missing from Design Document

The design document (plugged__1_.md) specified two separate tables:
1. `conversation_memories` - per-conversation observations
2. `user_memories` - cross-conversation persistent knowledge

**Current implementation** uses a single `fresh_memory` + `memory_ring` model instead. This is architecturally simpler but loses the explicit conversation-vs-user-level distinction.

---

## 4. Focus Agent Alignment Score

### 5-Layer Architecture Scoring

| Layer | Design Target | Implementation | Score |
|-------|--------------|----------------|-------|
| **L1: Focus Agent** | 7-9 item working set, attention-based relevance, context-switch detection | Working set in session JSONB, add/remove/replace ops, no automatic context-switch detection | **7/10** |
| **L2: Fresh Memory** | Observation buffer with Tier-1 artifact detection (regex), Tier-2 LLM gate, salience scoring, novelty dedup, PII detection | Basic observation buffer with TTL, embedding generation, type classification. No artifact detection, no LLM gate, no salience scoring, no novelty hash, no PII detection | **4/10** |
| **L3: Analytics Agent** | Bidirectional filter, LLM classification into 6 ring types, success gates, merge/reinforce | LLM classification into 4 ring types, success gate for LONGTERM, reinforcement on high similarity (0.9+). Missing 2 ring types, no bidirectional feedback loop | **7/10** |
| **L4: Memory Ring** | 6 segments (procedures, practice/habits, longterm, shocks, policies, ???), decay with token economics, natural selection | 4 segments (procedures, practice, longterm, shocks), full decay engine, natural selection, progressive retrieval | **7/10** |
| **L5: Gut Agent** | Cross-profile anonymized patterns, k-anonymity, weekly aggregation | SHA-256 hashing, k=3 anonymity, pattern normalization, success rate tracking | **8/10** |

**Overall Alignment Score: 6.6/10**

### Key Score Deductions

1. **-3 on Fresh Memory**: Missing Tier-1 artifact detection, Tier-2 LLM gate, salience scoring, novelty dedup, PII detection
2. **-3 on Analytics Agent**: Only 4 of 6 ring types, no bidirectional feedback
3. **-3 on Focus Agent**: No automatic context-switch detection, no attention-decay model

---

## 5. Critical Gaps (Priority Order)

### Gap #1: MCP Tools Not Registered (SEVERITY: BLOCKER)

**Location**: `pluggedin-mcp/src/mcp-proxy.ts:1417-1431`

Memory tools are fully defined in `static-tools.ts` with Zod schemas and handlers in `static-handlers.ts`, but they are **NOT added to the `staticTools` array** in `mcp-proxy.ts`. This means:

- `pluggedin_memory_observe` - WILL NOT EXECUTE
- `pluggedin_memory_search` - WILL NOT EXECUTE
- `pluggedin_memory_session_start` - WILL NOT EXECUTE
- `pluggedin_memory_session_end` - WILL NOT EXECUTE
- `pluggedin_memory_details` - WILL NOT EXECUTE

**Fix**: Add 5 memory tool names to the `staticTools` array at line 1430 in `mcp-proxy.ts`.

### Gap #2: No Zod Validation in Server Actions (SEVERITY: HIGH)

**Location**: `app/actions/memory.ts`

All 15 server actions accept raw params without Zod validation. Per CLAUDE.md, server actions MUST use `'use server'` + Zod validation + try/catch. The `try/catch` is present, `'use server'` is present, but **no Zod schemas validate inputs**.

Compare with `app/actions/clipboard.ts` which uses Zod for every action.

### Gap #3: No Tier-1 Artifact Detection (SEVERITY: HIGH)

**Location**: `lib/memory/observation-service.ts:addObservation()`

The design document specifies regex-based extraction of:
- Email addresses
- URLs
- File paths
- Error codes/IDs
- API keys (for PII flagging)

Currently `addObservation()` stores raw content without any artifact extraction. This means:
- No structured metadata extraction from observations
- No PII detection at ingestion
- No tagging for later retrieval

### Gap #4: Missing Ring Types (SEVERITY: MEDIUM)

**Location**: `lib/memory/types.ts:36-42`

Only 4 ring types implemented:
- `procedures` - Repeatable processes
- `practice` - Successful patterns/habits
- `longterm` - Validated insights
- `shocks` - Critical failures

Missing from 6-segment model:
- `policies` - Organizational rules, constraints, governance
- `habits` (distinct from practice) - Automatic behaviors vs conscious practices

### Gap #5: No Salience Scoring at Observation (SEVERITY: MEDIUM)

**Location**: `lib/memory/observation-service.ts:addObservation()`

The design document specifies a salience scoring formula at observation time:

```
salience = base_type_weight
         + recency_bonus
         + emotional_intensity (for errors/successes)
         + novelty_score (inverse frequency)
```

Current implementation: No salience calculation. Observations are stored with flat priority, relying entirely on the Analytics Agent for later classification.

### Gap #6: No Novelty Hash / Deduplication (SEVERITY: MEDIUM)

**Location**: `lib/memory/observation-service.ts`, `db/schema.ts`

No `novelty_hash` column on `fresh_memory`. This means:
- Identical observations are stored multiple times
- No de-duplication before embedding generation (wasting API calls)
- No frequency tracking at the observation level

### Gap #7: No PII Detection or Consent (SEVERITY: MEDIUM)

No `pii_detected` boolean or `consent_level` column on `fresh_memory`. The design specifies:
- Automatic PII detection at observation ingestion
- User consent levels for memory retention
- PII masking before storage

### Gap #8: No Soft-Delete / Undo (SEVERITY: LOW)

`deleteMemory()` in server actions performs hard delete. The design specifies a soft-delete with undo capability for user-facing memory management.

---

## 6. Overlap Analysis

### zvec vs pgvector Decision

**Current**: zvec (Alibaba's in-process vector DB) with synchronous N-API bindings

**Trade-offs**:

| Aspect | zvec (Current) | pgvector (Planned Originally) |
|--------|----------------|-------------------------------|
| Deployment | File-based, `data/memory-vectors/` | Inside PostgreSQL |
| Multi-tenancy | Query-level filtering (profile_uuid) | Same |
| Backup | Separate from DB backups | Included in pg_dump |
| Scaling | Single-node only | Scales with PostgreSQL |
| Search | Synchronous, in-process | Async, SQL queries |
| Index | HNSW via zvec | HNSW via pgvector |

**Concern**: zvec data at `data/memory-vectors/` is NOT included in standard PostgreSQL backups. This creates a data integrity risk - if the database is restored but the zvec files are lost, all vector search capability is broken while the PostgreSQL data remains.

### Two-Step Query Pattern

All searches use: zvec search -> get `{uuid, score}[]` -> PostgreSQL `WHERE uuid IN (...)` to fetch full records. This adds latency but keeps the authoritative data in PostgreSQL.

### Session vs Observation Architecture

The plan specified both `memory_sessions` and `fresh_memory` tables - both are implemented. The session lifecycle (start -> observe -> end -> Z-report) is complete.

---

## 7. Security Review

### Authentication

| Endpoint | Auth | Rate Limit | Status |
|----------|------|------------|--------|
| All 13 API routes | `authenticate(request)` | `EnhancedRateLimiters.api` | PASS |
| Server actions | userId parameter | N/A (server-side) | PASS |
| MCP tools | API key (via pluggedin-mcp) | N/A | PASS |

### Input Validation

| Layer | Validation | Status |
|-------|-----------|--------|
| API routes | Zod schemas on POST bodies | PARTIAL (some routes use Zod, some don't) |
| Server actions | None | FAIL - no Zod validation |
| MCP tools | Zod schemas via pluggedin-mcp | PASS |

### Data Isolation

| Mechanism | Status |
|-----------|--------|
| PostgreSQL: profile_uuid scoping | PASS - all queries filter by profile_uuid |
| zvec: profile_uuid filter field | PASS - INVERT index on profile_uuid |
| Gut patterns: k-anonymity (k=3) | PASS - only stores patterns seen by 3+ profiles |
| Gut patterns: SHA-256 hashing | PASS - patterns are normalized before hashing |

### Potential Vulnerabilities

1. **No PII filtering**: Sensitive data (API keys, passwords, emails) may be stored in observations
2. **Embedding API key exposure**: `OPENAI_API_KEY` used for embeddings - if compromised, all embedding calls are exposed
3. **zvec file permissions**: No explicit permission checks on `data/memory-vectors/` directory
4. **LLM injection**: Classification prompt could be manipulated via crafted observation content

---

## 8. Cost Implications

### Embedding Costs (text-embedding-3-small)

| Operation | Trigger | Estimated Cost |
|-----------|---------|---------------|
| Observation ingestion | Every `addObservation()` call | ~$0.00002 per call |
| Ring promotion | After classification | ~$0.00002 per promotion |
| Search query | Every `searchMemories()` call | ~$0.00002 per query |
| Decay recompression | Re-embed after compression | ~$0.00002 per decay |

### LLM Classification Costs (gpt-4o-mini)

| Operation | Trigger | Estimated Cost |
|-----------|---------|---------------|
| Observation classification | `classifyBatch()` | ~$0.0005 per observation |
| Z-report generation | `endSession()` | ~$0.005 per session |
| Decay compression | Each decay stage | ~$0.001 per compression |

### Estimated Monthly Cost (100 active agents, 50 sessions/day)

| Item | Volume | Unit Cost | Monthly |
|------|--------|-----------|---------|
| Embeddings | 50,000 | $0.00002 | $1.00 |
| Classification | 10,000 | $0.0005 | $5.00 |
| Z-reports | 1,500 | $0.005 | $7.50 |
| Decay compression | 2,000 | $0.001 | $2.00 |
| **Total** | | | **~$15.50/mo** |

### zvec Storage

- ~4KB per vector (1536 * fp32 + overhead)
- 100K vectors = ~400MB disk
- No cloud storage costs (local filesystem)

---

## 9. Recommended Next Steps (Priority Order)

### P0: Blockers (Must fix before merge)

1. **Register MCP tools in mcp-proxy.ts** - Add 5 memory tool names to `staticTools` array
2. **Add Zod validation to server actions** - Create schemas for all 15 actions in `app/actions/memory.ts`

### P1: High Priority (Should fix before production use)

3. **Add Tier-1 artifact detection** - Regex extraction in `addObservation()` for emails, URLs, error codes
4. **Add novelty_hash column** to `fresh_memory` table - SHA-256 of content for deduplication
5. **Add PII detection** - At minimum, regex for API keys and credit card patterns with `pii_detected` flag
6. **Backup strategy for zvec** - Document or automate backup of `data/memory-vectors/` alongside pg_dump

### P2: Medium Priority (Before GA)

7. **Add 2 missing ring types** - `policies` and `habits` (or justify why 4 is sufficient)
8. **Add salience scoring** at observation ingestion time
9. **Implement soft-delete** with undo period for memory ring entries
10. **Add Tier-2 LLM gate** - Secondary validation before ring promotion
11. **Add export JSON** functionality for user data portability

### P3: Nice to Have (Post-GA)

12. **Automatic context-switch detection** in Focus Agent
13. **Bidirectional feedback loop** in Analytics Agent (ring -> fresh memory refinement)
14. **Keyboard bulk operations** in UI tabs
15. **Search refinement** - Full-text search fallback when vector search returns no results

---

## 10. Code Quality

### Strengths

1. **Consistent patterns**: All services follow `MemoryResult<T>` return type
2. **Clean separation**: Each service file has a single responsibility
3. **Defensive coding**: Non-fatal embedding failures don't block observation storage
4. **Constants file**: All thresholds and budgets are centralized and documented
5. **TypeScript types**: Comprehensive type definitions in `types.ts`
6. **Translations**: All 6 locales updated with memory-specific strings
7. **Decay engine**: Well-designed with multipliers for reinforcement, access, and success

### Issues

1. **No Zod validation in server actions** - Violates CLAUDE.md pattern
2. **Hardcoded LLM model names** - Classification uses `gpt-4o-mini` with env override but Z-report uses `gpt-4o` without override
3. **Console.error/warn for production logging** - Should use structured logger
4. **Type assertions** - Several `as Record<string, unknown>` casts in decay-engine.ts
5. **Missing error boundaries** - UI components don't have error boundaries
6. **Static tools count hardcoded** - `mcp-proxy.ts:733` and `:814` hardcode `17` as static tools count

### Test Coverage

No new tests were added for the memory system. Recommended:
- Unit tests for `focus-agent.ts` (working set management)
- Unit tests for `decay-engine.ts` (stage transitions, multipliers)
- Integration tests for the full observation -> classification -> promotion pipeline
- API route tests for all 13 endpoints

---

## Summary

The `feature/long-term-memory-system` branch delivers a **solid foundation** for the cognitive memory architecture. The core data model, service layer, API routes, and UI are all functional and the build passes cleanly. The two critical blockers are (1) registering MCP tools in `mcp-proxy.ts` and (2) adding Zod validation to server actions. Beyond those, the main gaps are in the observation ingestion layer (artifact detection, PII, salience, dedup) - which is where the design document's depth exceeds the current implementation most significantly.

**Overall Assessment**: 70% complete against full design spec. Production-ready after P0 fixes. Feature-complete after P1 items.
