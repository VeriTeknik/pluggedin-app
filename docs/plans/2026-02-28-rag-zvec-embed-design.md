# Design: Embed RAG into pluggedin-app with zvec

**Date:** 2026-02-28
**Status:** Approved
**Author:** Claude Code + Cem Karaca

---

## Problem Statement

`plugged_in_v3_server` (FastAPI + Milvus RAG backend) has critical security issues (no API auth, no rate limiting, filter injection risks - security score 4/10) and adds operational complexity as a separate Python microservice. The goal is to:

1. **Replace** plugged_in_v3_server with zvec (Alibaba's embedded vector database)
2. **Embed** RAG functionality directly into pluggedin-app (no separate service)
3. **Unify** the development environment with a single docker-compose

## Decision: zvec over pgvector

| Criteria | pgvector | zvec (chosen) |
|----------|----------|---------------|
| Performance | ~1-2K QPS | ~8K QPS |
| Architecture | SQL extension | Embedded library |
| Node.js API | Async (via pg) | Sync (worker thread needed) |
| Maturity | Production-proven | Pre-1.0 (v0.2.1) |
| Infrastructure | PostgreSQL only | Filesystem storage |

**Trade-off accepted:** zvec's sync API requires worker thread isolation, and Node.js bindings are pre-1.0. Accepted for performance benefits and zero-infrastructure vector storage.

## Architecture

### High-Level Overview

```
pluggedin-app (Next.js 15)
│
├── API Routes (async, non-blocking)
│   ├── POST /api/rag/upload     → Server Action → Worker Thread → zvec
│   ├── POST /api/rag/query      → Server Action → Worker Thread → zvec
│   ├── GET  /api/rag/status     → Upload progress cache
│   └── DELETE /api/rag/remove   → Server Action → Worker Thread → zvec
│
├── lib/vectors/                 → SHARED vector infrastructure (RAG + Memory + CBP)
│   ├── vector-worker.ts         → Single Worker Thread (zvec sync ops)
│   ├── vector-service.ts        → Async wrapper around worker
│   ├── embedding-service.ts     → Unified OpenAI embedding (text-embedding-3-small)
│   └── types.ts                 → Common vector types
│
├── lib/rag/                     → RAG-specific logic (uses lib/vectors/)
│   ├── chunking.ts              → Text splitting
│   └── types.ts                 → RAG domain types
│
└── data/vectors/                → Unified vector storage (Docker volume)
    ├── rag/{project_uuid}/      → RAG document collections
    ├── memory/{profile_uuid}/   → Memory system collections (Phase 2)
    └── cbp/                     → Collective patterns (Phase 4)
```

> **Note:** The vector infrastructure is shared across RAG, Memory, and CBP systems.
> See `docs/plans/2026-02-28-unified-platform-roadmap.md` for full cross-system architecture.

### Worker Thread Pattern

zvec's Node.js API is synchronous. To prevent blocking Next.js's event loop, all zvec operations run in a dedicated Worker Thread:

```
Main Thread (async)              Worker Thread (sync, safe)
─────────────────────           ──────────────────────────
rag-service.ts                  rag-worker.ts
  │                               │
  ├─ postMessage({               ├─ parentPort.on('message')
  │    type: 'query',            │    │
  │    projectUuid,              │    ├─ Open/create collection
  │    vector                    │    ├─ collection.querySync()
  │  })                          │    │
  │                               │    └─ parentPort.postMessage(results)
  └─ await promise ◄─────────────┘
```

**Worker operations:**
- `insert` - Add vectors to collection
- `query` - Similarity search
- `delete` - Remove vectors by ID
- `delete_by_filter` - Remove by document UUID
- `optimize` - Rebuild indexes after batch insert
- `stats` - Collection statistics

### Data Model

#### PostgreSQL: `document_chunks` table (new)

```sql
document_chunks (
  uuid            VARCHAR PRIMARY KEY,
  document_uuid   VARCHAR REFERENCES docs(uuid) ON DELETE CASCADE,
  project_uuid    VARCHAR NOT NULL,        -- fast filtering
  chunk_index     INTEGER NOT NULL,         -- ordering
  chunk_text      TEXT NOT NULL,             -- original text chunk
  zvec_vector_id  VARCHAR,                   -- reference ID in zvec
  created_at      TIMESTAMP DEFAULT NOW()
)

-- Index for fast lookups
CREATE INDEX idx_chunks_project ON document_chunks(project_uuid);
CREATE INDEX idx_chunks_document ON document_chunks(document_uuid);
CREATE INDEX idx_chunks_zvec_id ON document_chunks(zvec_vector_id);
```

#### zvec Collection Schema (per project)

```typescript
const schema = new ZVecCollectionSchema({
  name: "embeddings",
  vectors: {
    name: "embedding",
    dataType: ZVecDataType.VECTOR_FP32,
    dimension: 1536,  // OpenAI text-embedding-3-small (unified across RAG + Memory)
    indexParams: {
      indexType: ZVecIndexType.HNSW,
      metricType: ZVecMetricType.COSINE,
      m: 32,
      efConstruction: 200,
    }
  },
  fields: [
    { name: "chunk_uuid", dataType: ZVecDataType.STRING },
    { name: "document_uuid", dataType: ZVecDataType.STRING },
    { name: "domain", dataType: ZVecDataType.STRING },  // "rag", "memory", "cbp"
  ]
});
```

> **Embedding model update:** Changed from `text-embedding-ada-002` to `text-embedding-3-small` (newer, better performance, same dimensions). This aligns with the Memory system's embedding model for consistency.

**Separation of concerns:** Chunk text lives in PostgreSQL (backups, SQL queries, JOINs). zvec stores only vectors + reference IDs.

### Data Flows

#### Upload Flow

```
1. User uploads file (PDF/DOCX/TXT/MD)
2. File saved to disk: /app/uploads/{userId}/{timestamp}-{filename}
3. Document record inserted to PostgreSQL (docsTable)
4. Background processing:
   a. Extract text from file
   b. Split into chunks (RecursiveCharacterTextSplitter, 800 chars, 100 overlap)
   c. Generate embeddings via OpenAI API (batch)
   d. Insert chunks to PostgreSQL (document_chunks)
   e. Send vectors to worker thread → zvec insertSync + optimizeSync
   f. Update document status
5. Return upload_id for progress polling
```

#### Query Flow

```
1. User sends search query
2. Generate query embedding via OpenAI API
3. Send vector to worker thread → zvec querySync(topk: 5)
4. Receive chunk_uuids + similarity scores
5. PostgreSQL JOIN: document_chunks → docs → get full text + metadata
6. Return results with sources
```

#### Delete Flow

```
1. Delete from zvec: worker thread → collection.deleteByFilterSync
2. PostgreSQL CASCADE: document_chunks auto-deleted when doc removed
3. File removed from disk
```

## Docker Compose (Unified Dev Environment)

```yaml
services:
  # === Core ===
  postgres:
    image: pgvector/pgvector:pg18     # pgvector included for memory system
    ports: ["5432:5432"]
    volumes: ["postgres_data:/var/lib/postgresql/data"]
    environment:
      POSTGRES_DB: pluggedin
      POSTGRES_USER: pluggedin
      POSTGRES_PASSWORD: ${DB_PASSWORD:-devpassword}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pluggedin"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: ["redis_data:/data"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # === Main App ===
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports: ["12005:3000"]
    volumes:
      - zvec_data:/app/data/vectors      # zvec collection files
      - uploads_data:/app/uploads         # user uploaded files
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://pluggedin:${DB_PASSWORD:-devpassword}@postgres:5432/pluggedin
      REDIS_URL: redis://redis:6379
      ENABLE_RAG: "true"
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      ZVEC_DATA_PATH: /app/data/vectors

  migrate:
    build:
      context: .
      target: migrator
    depends_on:
      postgres:
        condition: service_healthy
    command: pnpm db:migrate
    environment:
      DATABASE_URL: postgresql://pluggedin:${DB_PASSWORD:-devpassword}@postgres:5432/pluggedin

  # === Registry Proxy ===
  registry-proxy:
    build: ../registry-proxy/proxy
    ports: ["8080:8080"]
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://pluggedin:${DB_PASSWORD:-devpassword}@postgres:5432/registry

  # === Observability ===
  prometheus:
    image: prom/prometheus:latest
    ports: ["9090:9090"]
    volumes:
      - ./observability/prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:latest
    ports: ["3001:3000"]
    volumes: ["grafana_data:/var/lib/grafana"]
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-admin}

  loki:
    image: grafana/loki:latest
    ports: ["3100:3100"]

volumes:
  postgres_data:
  redis_data:
  zvec_data:
  uploads_data:
  grafana_data:
```

**Start everything:**
```bash
docker compose up --build
```

## Migration from v3_server

### Files Changed

| File | Change |
|------|--------|
| `lib/rag-service.ts` | Rewrite: HTTP client → Worker Thread wrapper |
| `lib/rag/rag-worker.ts` | **New** - zvec sync operations |
| `lib/rag/embeddings.ts` | **New** - OpenAI embedding calls |
| `lib/rag/chunking.ts` | **New** - text splitting |
| `lib/rag/types.ts` | **New** - type definitions |
| `db/schema.ts` | Add `document_chunks` table |
| `app/actions/library.ts` | Update upload logic (HTTP → direct) |
| `Dockerfile` | Add `@zvec/zvec` native dependencies |
| `docker-compose.yml` | Unified compose file |
| `package.json` | Add `@zvec/zvec`, `openai` |

### Files/Dependencies Removed

- `RAG_API_URL` environment variable
- `plugged_in_v3_server` repository dependency
- Milvus dependency
- Python/FastAPI stack

### Backward Compatibility

- `ENABLE_RAG` feature flag continues to work
- API routes maintain same external interface
- Frontend components (library page) unchanged
- Optional migration script for existing v3_server data

## Security Improvements (vs v3_server)

| Issue | v3_server | New system |
|-------|-----------|------------|
| API Authentication | None | NextAuth.js session + API key |
| Authorization | Trust project_uuid | Server-side profile_uuid validation |
| Rate Limiting | None | Redis-backed tiered limits |
| Input Validation | Basic regex | Zod schemas |
| File Validation | Size only | Type + size + content |
| Error Exposure | Internal details | Sanitized messages |
| Audit Logging | None | Activity table tracking |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| zvec Node.js breaking changes (pre-1.0) | Medium | High | Pin version, monitor releases |
| Worker thread memory leaks | Low | Medium | Health checks, periodic restart |
| zvec data corruption | Low | High | Regular backups via Docker volume |
| OpenAI API cost spike | Medium | Medium | Rate limiting + budget alerts |
| Event loop blocking (if worker fails) | Low | High | Watchdog timer, fallback error |

## Shared Infrastructure for CBP Compatibility

The vector worker thread and embedding service are designed to be reused by:
- **Memory System** (Phase 2): Memory ring vectors stored at `data/vectors/memory/{profile_uuid}/`
- **CBP System** (Phase 4): Collective pattern vectors stored at `data/vectors/cbp/`

The worker thread supports a `domain` field to differentiate vector sources, enabling cross-domain queries (e.g., finding RAG documents related to a memory observation).

## Out of Scope

- Data migration script from v3_server (optional, can be added later)
- Local embedding models (HuggingFace) - OpenAI only for now
- Multi-vector queries (not supported in zvec Node.js yet)
- Distributed/multi-instance zvec (single process only)
