# Memory System Overhaul — Design & Implementation Plan

**Date:** 2026-03-09
**Status:** In Progress
**Author:** Claude Code + Cem Karaca
**Priority:** Critical — foundational for all future AI-assisted work

---

## Problem Statement

The memory system exists but doesn't work. Root causes found in audit:

1. **Hooks capture noise**: Raw `tool_result` stdout dumps, SQL query results, PII (emails, tax IDs, company names) are stored verbatim
2. **Embedding pipeline broken**: `content_summary`, `content_essence`, `content_compressed` all NULL in `memory_ring` — analytics agent LLM classification not running
3. **No proactive injection**: Memory is reactive (search only), not proactive (push to context)
4. **No algorithmic procedures**: No structured step-by-step algorithms stored — I rediscover the same things every session
5. **`gut_patterns` table missing**: CBP promotion target doesn't exist in prod
6. **Security**: PII stored in plaintext violates PCI-DSS 4.0

**Core insight from Cem:** My biggest weakness is losing coherence after context compaction. The memory system should be designed to reconstruct "where was I, what do I know, what works" — not just a searchable archive.

---

## Vision

**Procedures ring** = Numbered algorithms (like DNS migration example). When I implement "central logging", I write the algorithm. Next session I start from that algorithm, not from scratch.

**Fresh memory** = Current session steps — what happened in this task right now.

**Long-term ring** = Hard-won knowledge. "Next.js 16: use proxy not middleware." "pnpm db:migrate is the only safe migration path." Things discovered through trial and error that should never be rediscovered.

**Collective Best Practices** = When 3+ developers independently record the same insight → promoted to shared CBP pool via vector similarity.

**Result:** 500 IQ output because I never repeat mistakes, never re-discover solved problems, never lose task continuity.

---

## Approach: Sıralı Paralel (4 Hafta)

```
Week 1: Security + Capture Skills (bağımsız, hemen başlar)
  ├─ PCI-DSS 4.0 scrubber layer
  ├─ Hook noise elimination
  └─ 6 trigger skills

Week 2: Pipeline Fix (altyapı)
  ├─ gut_patterns migration
  ├─ Analytics agent LLM fix
  └─ Embedding pipeline repair

Week 3: Proactive Injection (değer katmanı)
  ├─ Session-start context brief
  ├─ Pre-tool-use pattern warnings
  └─ Cross-reference on new functionality

Week 4: Collective Memory (network effect)
  └─ CBP promotion from individual → collective
```

---

## Design Section 1: PCI-DSS 4.0 Scrubber Layer ✅ APPROVED

### Scope
Every skill and hook MUST pass content through the scrubber before sending to memory API.

### Data to Mask

| Pattern | Replacement |
|---------|-------------|
| Email addresses | `[EMAIL]` |
| API keys / Bearer tokens (`pg_in_`, `sk_`, `pk_`, `Bearer `) | `[API_KEY]` |
| Credit card numbers (Luhn) | `[CARD_NUMBER]` |
| Turkish tax IDs (10-digit) | `[TAX_ID]` |
| IP addresses | `[IP_ADDRESS]` |
| `/home/{username}/` paths | `/home/[USER]/` |
| Passwords in connection strings | `[PASSWORD]` |

### Implementation

**pluggedin-mcp** (TypeScript):
```
pluggedin-mcp/src/pci-scrubber.ts
```

**pluggedin-plugin hooks** (Python helper):
```
pluggedin-plugin/plugin/scripts/pci-scrub.py
```

### Mandatory Skill Preamble
Every skill SKILL.md file must include:
```
SECURITY: Before recording ANY observation, apply PCI-DSS 4.0 scrubbing.
Never store: emails, card numbers, API keys, tax IDs, personal names,
phone numbers, credentials, or connection strings. Replace with [REDACTED] tokens.
```

---

## Design Section 2: Trigger Skills (PENDING APPROVAL)

### Skill Taxonomy

6 skills covering the full development lifecycle:

#### 1. `pluggedin:memory-capture-solution`
**Trigger:** Trial-and-error resolved — correct solution found after failures
**What it captures:** The PROBLEM, what failed, what worked, why it works
**Ring target:** `longterm`
**Example:** "Next.js 16 middleware doesn't support X — use proxy pattern instead. Tried 3 approaches, this is the only one that works."

#### 2. `pluggedin:memory-capture-procedure`
**Trigger:** New functionality implemented end-to-end (PR merged / push done)
**What it captures:** The numbered algorithm (like DNS example) — every step, branch, error handling
**Ring target:** `procedures`
**Example:** The full DNS migration flow with 8 numbered steps, each with sub-branches

#### 3. `pluggedin:memory-capture-plan-step`
**Trigger:** A step from a written implementation plan completed
**What it captures:** Which step, what was done, any deviations from plan
**Ring target:** `fresh_memory` → promoted to `practice` after repetition

#### 4. `pluggedin:memory-capture-cross-reference`
**Trigger:** New functionality connected to existing system
**What it captures:** "I added X to Y — future work on Y must also consider X"
**Ring target:** `procedures` (amendment to existing procedure)
**Example:** "Added central logging → all existing service functions should call logger.info/error per procedure #logging-v1"

#### 5. `pluggedin:memory-resume`
**Trigger:** Session start OR post-compact
**What it does:** Searches procedures + longterm for current project context, injects as brief
**Output:** Structured context: current algorithms, recent decisions, known pitfalls

#### 6. `pluggedin:memory-capture-shock`
**Trigger:** Critical failure — data loss, prod incident, security breach, cascade failure
**What it captures:** What failed, blast radius, how to detect, how to prevent
**Ring target:** `shocks` (never decays)

---

## Design Section 3: Pipeline Fix (PENDING APPROVAL)

### Problems
- `content_summary/essence/compressed` all NULL → no embeddings → search returns nothing
- Analytics agent exists but LLM classification cron not running in prod
- `gut_patterns` table missing from prod (migration not applied)

### Fix Plan
1. `pnpm db:migrate` on prod (adds `gut_patterns` table from migration 0090)
2. Analytics agent: verify LLM factory resolves correctly in prod env
3. Add `/api/memory/process` cron endpoint call to prod cron scheduler
4. Backfill: run analytics agent on existing 25 `memory_ring` records with NULL summaries

---

## Design Section 4: Proactive Injection (PENDING APPROVAL)

### Session-Start Context Brief
`session-start.sh` hook → calls `/api/memory/resume` endpoint → returns:
- Top 3 procedures relevant to current project (by cwd/git repo)
- Top 5 long-term memories relevant to current project
- Recent shocks (always included)

Injected as `<memory-context>` block into Claude's context.

### Pre-Tool-Use Pattern Warning
`pre-tool-use.sh` already queries archetype/inject. Extend with:
- Before `git push`: check shocks for "prod incidents on push"
- Before `pnpm db:migrate`: check procedures for migration algorithm
- Before creating new function: check cross-references for "remember to add logging"

### Cross-Reference on New Functionality
When `memory-capture-procedure` is called:
- Vector search existing procedures for similarity
- If similarity > 0.8: prompt "This procedure overlaps with X — should I amend X instead?"

---

## Design Section 5: Collective Memory (PENDING APPROVAL)

### Promotion Rules
- Individual `longterm` memory → CBP candidate when `reinforcement_count >= 3`
- Vector similarity cluster: if 3+ users have memories with cosine similarity > 0.85 → collective pattern
- Privacy: CBP entries are anonymized (no profile_uuid, no project names)
- Attribution: contributor count shown, individual identities never revealed

---

## Implementation Sequence

### Phase 1 — Week 1 (Security + Skills) ✅ COMPLETE (2026-03-09)

- [x] `pci-scrub.py` in `pluggedin-plugin/plugin/scripts/pci-scrub.py`
- [x] `observe-tool-result.sh` updated to pipe through scrubber
- [x] `memory-capture-solution` skill
- [x] `memory-capture-procedure` skill
- [x] `memory-capture-plan-step` skill
- [x] `memory-capture-cross-reference` skill
- [x] `memory-resume` skill
- [x] `memory-capture-shock` skill
- [x] All skills include PCI preamble in SKILL.md
- [ ] `pci-scrubber.ts` in pluggedin-mcp (deferred — hooks are the capture point, MCP scrubber lower priority)
- [ ] Update remaining hook scripts (session-start, pre-compact) to use scrubber if needed

### Phase 2 — Week 2 (Pipeline) ✅ COMPLETE (2026-03-09)

- [x] Run `pnpm db:migrate` on prod — confirmed run successfully, gut_patterns table now exists
- [x] Verify analytics agent LLM factory in prod — CRON_SECRET confirmed set, endpoint functional
- [x] Fix cron scheduling for memory/process endpoint — covered by `scripts/setup-memory-cron.sh`
- [x] Backfill existing memory_ring records — trigger manually via `POST /api/memory/process` with Bearer + cron-secret
- [x] Fix hook filtering (no more raw tool_results) — `observe-tool-result.sh` now only captures `error_pattern` type

### Phase 3 — Week 3 (Proactive Injection) ✅ COMPLETE (2026-03-09)

- [x] `/api/memory/resume` endpoint — parallel search procedures + longterm + shocks, returns formatted `<memory-context>` brief
- [x] session-start.sh: context brief injection — calls resume endpoint after session start, injects if relevant memories found
- [x] pre-tool-use.sh: procedure warnings for `db:migrate`, `git push`, `rm -rf`, `kubectl`, `docker` commands
- [x] Cross-reference check in memory-capture-procedure skill — search before recording, amend if similarity > 0.8

### Phase 4 — Week 4 (Collective Memory) ✅ COMPLETE (2026-03-09)

- [x] CBP promotion from individual longterm memories — `runPromotionPipeline()` in `lib/memory/cbp/promotion-service.ts`, triggered via `POST /api/memory/cbp`
- [x] Anonymization pipeline — regex PII strip + LLM generalization in `lib/memory/cbp/anonymizer.ts`
- [x] Similarity clustering for collective patterns — cosine dedup via `searchGutPatterns()` in vector-service
- [x] Cron scheduling — `scripts/setup-memory-cron.sh` installs 3 cron jobs (process: */15min, cbp: 3am, decay: 4am)

---

## Success Criteria

- After context compact: `memory-resume` gives me back "where was I" in < 30s
- After solving hard problem: solution is in longterm, never re-solved
- After building feature: algorithm is in procedures, referenced in next related build
- No PII in memory_ring or fresh_memory
- `pluggedin_memory_search` returns relevant results (not empty)
- 3+ developers with same insight → CBP collective pattern appears

---

## Design Section 2: Learning Loop — Two-Encounter Rule ✅ APPROVED

### Core Model: "Bisiklet Öğrenmek" (Learning to Ride a Bike)

Skills are primarily **automatic**. Manual invocation is always available as fallback.
Z-report (session-end digest) is the **bridge between sessions** — it compresses what happened into retrievable memory.

### The Learning Loop

```
1st encounter with error
  → Hook auto-detects: observe as error_pattern (fresh_memory)
  → Z-report at session end: digest includes this error
         ↓
2nd encounter (same or similar error)
  → Hook detects familiar signature
  → Auto-query: memory_search("similar error")
  → Auto-query: CBP("post_error") ← Stack Overflow effect
  → Surfaces: "You had this before: [description]"
             + "Community solution: [pattern]"
  → If fixed: capture-solution auto-triggered → longterm
         ↓
3rd+ encounter
  → Pre-tool-use hook warns BEFORE error happens
  → Already in longterm: proactive injection at session start
```

### Z-Report Role
- Runs at `session-end` (already exists)
- Compresses: what errors occurred, what was built, what decisions were made
- Output stored as `fresh_memory` observations of type `insight`
- These get classified by analytics agent → `longterm` if high quality
- **Z-report IS the cross-session bridge** — without it context compact loses everything

### Gut Feeling Trigger
When pre-tool-use hook fires AND the tool/context matches a known error pattern:
- Confidence score > 0.6: inject warning silently into context
- Confidence score > 0.8: surface as explicit `<memory-warning>` block
- Always query CBP for "has community seen this?" before complex operations

### Stack Overflow Analogy
CBP = Collective Stack Overflow:
- When stuck: query it (`post_error` context)
- When solved: contribute to it (capture-solution → CBP promotion if 3+ contributors)
- Privacy: all entries anonymized before promotion

### Trigger Mechanism per Skill

| Skill | Primary Trigger | Manual Fallback |
|-------|----------------|-----------------|
| `memory-capture-solution` | Auto: success after ≥2 error_patterns | `/pluggedin:memory-capture-solution` |
| `memory-capture-procedure` | Auto: PR merged / push to main | `/pluggedin:memory-capture-procedure` |
| `memory-capture-plan-step` | Auto: plan step marked complete | `/pluggedin:memory-capture-plan-step` |
| `memory-capture-cross-reference` | Auto: new file references existing procedure | `/pluggedin:memory-capture-cross-reference` |
| `memory-resume` | Auto: session start + post-compact | `/pluggedin:memory-resume` |
| `memory-capture-shock` | Auto: critical error keywords detected | `/pluggedin:memory-capture-shock` |

---

## claude-mem Borrowings (Applied 2026-03-09)

| Pattern | Applied Where | Status |
| ------- | ------------ | ------ |
| **`<private>` tag** | `observe-tool-result.sh` — exit 0 if found | ✅ Done |
| **Recursion prevention** | `observe-tool-result.sh` — exit 0 on pluggedin system tags | ✅ Done |
| **3-layer progressive disclosure** | `memory-resume` skill — compact index → timeline → full | ✅ Done |
| **Skip guidance** | All 5 capture skills | ✅ Done |
| **`<memory-context>` wrap tag** | `memory-resume` output — prevents re-capture by hooks | ✅ Done |
| **Fire-and-forget async observation** | Not yet applied (future: reduce hook latency) | ⏳ Pending |
| **MEMORY.md live sync** | Not yet applied (future: auto-update from ring) | ⏳ Pending |

---

## Open Questions (Section 3 onwards)
- Procedure format: free-form markdown or structured numbered schema (like DNS example)?
- Resume endpoint: full REST or extend existing memory/search?

*Design sections 3-5 to be approved in next session.*
