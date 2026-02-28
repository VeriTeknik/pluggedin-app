# Phase 1: RAG zvec Migration + Shared Vector Infrastructure

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace plugged_in_v3_server (FastAPI + Milvus HTTP backend) with zvec embedded directly in pluggedin-app, creating a shared vector infrastructure (`lib/vectors/`) that RAG, Memory, and CBP all use.

**Architecture:** zvec runs in-process (synchronous API, no worker thread needed since Memory already uses it directly). Shared `lib/vectors/` provides embedding generation and vector operations. RAG-specific logic (chunking) lives in `lib/rag/`. Chunk text stored in PostgreSQL (`document_chunks` table), vectors in zvec filesystem collections. Unified data path at `data/vectors/`.

**Tech Stack:** @zvec/zvec (v0.2.1, already installed), @langchain/openai (already installed), Drizzle ORM, Vitest

**Design Docs:**
- `docs/plans/2026-02-28-rag-zvec-embed-design.md`
- `docs/plans/2026-02-28-unified-platform-roadmap.md`

**Branch:** `feature/rag-zvec-migration`

---

## Task 1: Create Shared Vector Types

**Files:**
- Create: `lib/vectors/types.ts`
- Test: `tests/vectors/types.test.ts`

**Step 1: Write the test**

Create `tests/vectors/types.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import type {
  VectorDomain,
  VectorInsertParams,
  VectorSearchParams,
  VectorSearchResult,
  VectorDeleteParams,
} from '@/lib/vectors/types';

describe('Shared Vector Types', () => {
  it('should define VectorDomain union', () => {
    const domains: VectorDomain[] = ['rag', 'fresh_memory', 'memory_ring', 'gut_patterns'];
    expect(domains).toHaveLength(4);
  });

  it('should define VectorInsertParams', () => {
    const params: VectorInsertParams = {
      id: 'vec-1',
      embedding: [0.1, 0.2, 0.3],
      domain: 'rag',
      fields: { project_uuid: 'proj-1', document_uuid: 'doc-1' },
    };
    expect(params.domain).toBe('rag');
  });

  it('should define VectorSearchParams', () => {
    const params: VectorSearchParams = {
      embedding: [0.1, 0.2, 0.3],
      domain: 'rag',
      topK: 5,
      filter: 'project_uuid = "proj-1"',
    };
    expect(params.topK).toBe(5);
  });

  it('should define VectorSearchResult', () => {
    const result: VectorSearchResult = {
      id: 'vec-1',
      score: 0.95,
      fields: { project_uuid: 'proj-1' },
    };
    expect(result.score).toBe(0.95);
  });

  it('should define VectorDeleteParams', () => {
    const params: VectorDeleteParams = {
      ids: ['vec-1', 'vec-2'],
      domain: 'rag',
    };
    expect(params.ids).toHaveLength(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/ckaraca/Mns/pluggedin-app && pnpm test tests/vectors/types.test.ts`

Expected: FAIL - Cannot find module `@/lib/vectors/types`

**Step 3: Write the implementation**

Create `lib/vectors/types.ts`:

```typescript
/**
 * Shared vector types for RAG, Memory, and CBP systems.
 * All vector operations across the platform use these types.
 */

/** Which subsystem owns the vectors */
export type VectorDomain = 'rag' | 'fresh_memory' | 'memory_ring' | 'gut_patterns';

/** Embedding model configuration */
export const EMBEDDING_DIMENSIONS = 1536;
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/** Parameters for inserting a vector */
export interface VectorInsertParams {
  id: string;
  embedding: number[];
  domain: VectorDomain;
  fields: Record<string, string>;
}

/** Parameters for searching vectors */
export interface VectorSearchParams {
  embedding: number[];
  domain: VectorDomain;
  topK?: number;
  filter?: string;
  threshold?: number;
}

/** A single search result */
export interface VectorSearchResult {
  id: string;
  score: number;
  fields: Record<string, string>;
}

/** Parameters for deleting vectors */
export interface VectorDeleteParams {
  ids?: string[];
  domain: VectorDomain;
  filter?: string;
}

/** Parameters for deleting by filter */
export interface VectorDeleteByFilterParams {
  domain: VectorDomain;
  filter: string;
}

/** Collection statistics */
export interface VectorStats {
  domain: VectorDomain;
  count: number;
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/ckaraca/Mns/pluggedin-app && pnpm test tests/vectors/types.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
cd /Users/ckaraca/Mns/pluggedin-app && git add lib/vectors/types.ts tests/vectors/types.test.ts && git commit -m "$(cat <<'EOF'
feat(vectors): add shared vector types for RAG, Memory, and CBP

Define VectorDomain, insert/search/delete params, and search results
used by all vector subsystems in the platform.
EOF
)"
```

---

## Task 2: Create Shared Embedding Service

**Files:**
- Create: `lib/vectors/embedding-service.ts`
- Test: `tests/vectors/embedding-service.test.ts`

**Step 1: Write the test**

Create `tests/vectors/embedding-service.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock @langchain/openai
vi.mock('@langchain/openai', () => ({
  OpenAIEmbeddings: vi.fn().mockImplementation(() => ({
    embedQuery: vi.fn().mockResolvedValue(Array.from({ length: 1536 }, () => 0.1)),
    embedDocuments: vi.fn().mockResolvedValue([
      Array.from({ length: 1536 }, () => 0.1),
      Array.from({ length: 1536 }, () => 0.2),
    ]),
  })),
}));

import {
  generateEmbedding,
  generateEmbeddings,
  estimateTokenCount,
  EMBEDDING_DIMENSIONS,
} from '@/lib/vectors/embedding-service';

describe('Shared Embedding Service', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('should export correct embedding dimension', () => {
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
  });

  it('should generate a single embedding', async () => {
    const result = await generateEmbedding('Hello world');
    expect(result).toHaveLength(1536);
    expect(typeof result[0]).toBe('number');
  });

  it('should generate batch embeddings', async () => {
    const results = await generateEmbeddings(['Hello', 'World']);
    expect(results).toHaveLength(2);
    results.forEach((emb) => {
      expect(emb).toHaveLength(1536);
    });
  });

  it('should return empty array for empty batch', async () => {
    const results = await generateEmbeddings([]);
    expect(results).toHaveLength(0);
  });

  it('should estimate token count', () => {
    const count = estimateTokenCount('Hello world test');
    expect(count).toBeGreaterThan(0);
    // ~4 chars per token, "Hello world test" = 16 chars / 4 = 4 tokens
    expect(count).toBe(4);
  });

  it('should throw if OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    // Reset singleton
    vi.resetModules();
    const mod = await import('@/lib/vectors/embedding-service');
    await expect(mod.generateEmbedding('test')).rejects.toThrow('OPENAI_API_KEY');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/ckaraca/Mns/pluggedin-app && pnpm test tests/vectors/embedding-service.test.ts`

Expected: FAIL - Cannot find module `@/lib/vectors/embedding-service`

**Step 3: Write the implementation**

Create `lib/vectors/embedding-service.ts`:

```typescript
/**
 * Shared Embedding Service
 *
 * Generates vector embeddings from text using OpenAI's embedding API.
 * Used by RAG, Memory, and CBP systems.
 * Uses @langchain/openai (already a project dependency).
 */

import { OpenAIEmbeddings } from '@langchain/openai';

export { EMBEDDING_DIMENSIONS, DEFAULT_EMBEDDING_MODEL } from './types';

let embeddingsInstance: OpenAIEmbeddings | null = null;

function getEmbeddings(): OpenAIEmbeddings {
  if (!embeddingsInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for vector embeddings');
    }

    embeddingsInstance = new OpenAIEmbeddings({
      openAIApiKey: apiKey,
      modelName: process.env.MEMORY_EMBEDDING_MODEL || 'text-embedding-3-small',
      dimensions: 1536,
    });
  }
  return embeddingsInstance;
}

/**
 * Generate embedding vector for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const embeddings = getEmbeddings();
  return embeddings.embedQuery(text);
}

/**
 * Generate embedding vectors for multiple texts (batch)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const embeddings = getEmbeddings();
  return embeddings.embedDocuments(texts);
}

/**
 * Estimate token count for a text (rough approximation: ~4 chars per token)
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/ckaraca/Mns/pluggedin-app && pnpm test tests/vectors/embedding-service.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
cd /Users/ckaraca/Mns/pluggedin-app && git add lib/vectors/embedding-service.ts tests/vectors/embedding-service.test.ts && git commit -m "$(cat <<'EOF'
feat(vectors): add shared embedding service

Unified OpenAI embedding generation (text-embedding-3-small, 1536 dim)
for RAG, Memory, and CBP systems. Uses @langchain/openai.
EOF
)"
```

---

## Task 3: Create Shared Vector Service

**Files:**
- Create: `lib/vectors/vector-service.ts`
- Create: `lib/vectors/index.ts`
- Test: `tests/vectors/vector-service.test.ts`

**Step 1: Write the test**

Create `tests/vectors/vector-service.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock @zvec/zvec
vi.mock('@zvec/zvec', () => {
  const mockCollection = {
    upsertSync: vi.fn(),
    querySync: vi.fn().mockReturnValue([
      { id: 'vec-1', score: 0.95, fields: { project_uuid: 'proj-1' } },
    ]),
    deleteSync: vi.fn(),
    deleteByFilterSync: vi.fn(),
  };

  return {
    ZVecInitialize: vi.fn(),
    ZVecOpen: vi.fn().mockReturnValue(mockCollection),
    ZVecCreateAndOpen: vi.fn().mockReturnValue(mockCollection),
    ZVecCollectionSchema: vi.fn(),
    ZVecDataType: { VECTOR_FP32: 'VECTOR_FP32', STRING: 'STRING' },
    ZVecIndexType: { HNSW: 'HNSW', INVERT: 'INVERT' },
    ZVecMetricType: { COSINE: 'COSINE' },
  };
});

import {
  upsertVector,
  searchVectors,
  deleteVectors,
  deleteVectorsByFilter,
} from '@/lib/vectors/vector-service';

describe('Shared Vector Service', () => {
  it('should upsert a vector', () => {
    expect(() => upsertVector({
      id: 'vec-1',
      embedding: Array(1536).fill(0.1),
      domain: 'rag',
      fields: { project_uuid: 'proj-1' },
    })).not.toThrow();
  });

  it('should search vectors', () => {
    const results = searchVectors({
      embedding: Array(1536).fill(0.1),
      domain: 'rag',
      topK: 5,
    });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('vec-1');
    expect(results[0].score).toBe(0.95);
  });

  it('should delete vectors by ID', () => {
    expect(() => deleteVectors({
      ids: ['vec-1'],
      domain: 'rag',
    })).not.toThrow();
  });

  it('should delete vectors by filter', () => {
    expect(() => deleteVectorsByFilter({
      domain: 'rag',
      filter: 'document_uuid = "doc-1"',
    })).not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/ckaraca/Mns/pluggedin-app && pnpm test tests/vectors/vector-service.test.ts`

Expected: FAIL - Cannot find module `@/lib/vectors/vector-service`

**Step 3: Write the implementation**

Create `lib/vectors/vector-service.ts`:

```typescript
/**
 * Shared Vector Service
 *
 * In-process vector operations using zvec. Provides a unified interface
 * for RAG, Memory, and CBP vector storage and search.
 *
 * Each domain gets its own zvec collection with domain-specific fields.
 * All collections share the same HNSW index configuration and embedding dimensions.
 */

import path from 'path';
import {
  ZVecCollectionSchema,
  ZVecCreateAndOpen,
  ZVecDataType,
  ZVecIndexType,
  ZVecInitialize,
  ZVecMetricType,
  ZVecOpen,
  type ZVecCollection,
} from '@zvec/zvec';

import type {
  VectorDeleteByFilterParams,
  VectorDeleteParams,
  VectorDomain,
  VectorInsertParams,
  VectorSearchParams,
  VectorSearchResult,
  VectorStats,
} from './types';
import { EMBEDDING_DIMENSIONS } from './types';

// ─── Configuration ─────────────────────────────────────────────────

const ZVEC_DATA_DIR = process.env.ZVEC_DATA_PATH
  || process.env.MEMORY_VECTOR_DATA_DIR
  || path.join(process.cwd(), 'data', 'vectors');

let initialized = false;

function ensureInitialized(): void {
  if (!initialized) {
    ZVecInitialize({ logLevel: 2 }); // WARN
    initialized = true;
  }
}

// ─── Collection Management ─────────────────────────────────────────

const collections: Record<string, ZVecCollection> = {};

const INVERT_INDEX = { indexType: ZVecIndexType.INVERT } as const;

const EMBEDDING_VECTOR_CONFIG = {
  name: 'embedding',
  dataType: ZVecDataType.VECTOR_FP32,
  dimension: EMBEDDING_DIMENSIONS,
  indexParams: {
    indexType: ZVecIndexType.HNSW,
    metricType: ZVecMetricType.COSINE,
  },
} as const;

/**
 * Domain-specific collection field definitions.
 * Each domain has its own set of filterable fields stored alongside vectors.
 */
const DOMAIN_FIELDS: Record<VectorDomain, ConstructorParameters<typeof ZVecCollectionSchema>[0]['fields']> = {
  rag: [
    { name: 'project_uuid', dataType: ZVecDataType.STRING, indexParams: INVERT_INDEX },
    { name: 'document_uuid', dataType: ZVecDataType.STRING, indexParams: INVERT_INDEX },
    { name: 'chunk_uuid', dataType: ZVecDataType.STRING, indexParams: INVERT_INDEX },
  ],
  fresh_memory: [
    { name: 'profile_uuid', dataType: ZVecDataType.STRING, indexParams: INVERT_INDEX },
    { name: 'agent_uuid', dataType: ZVecDataType.STRING, nullable: true, indexParams: INVERT_INDEX },
  ],
  memory_ring: [
    { name: 'profile_uuid', dataType: ZVecDataType.STRING, indexParams: INVERT_INDEX },
    { name: 'agent_uuid', dataType: ZVecDataType.STRING, nullable: true, indexParams: INVERT_INDEX },
    { name: 'ring_type', dataType: ZVecDataType.STRING, indexParams: INVERT_INDEX },
  ],
  gut_patterns: [
    { name: 'pattern_type', dataType: ZVecDataType.STRING, indexParams: INVERT_INDEX },
  ],
};

function getCollection(domain: VectorDomain): ZVecCollection {
  if (collections[domain]) return collections[domain];

  ensureInitialized();

  const collectionPath = path.join(ZVEC_DATA_DIR, domain);
  const fields = DOMAIN_FIELDS[domain];

  try {
    collections[domain] = ZVecOpen(collectionPath);
  } catch {
    const schema = new ZVecCollectionSchema({
      name: domain,
      vectors: EMBEDDING_VECTOR_CONFIG,
      fields,
    });
    collections[domain] = ZVecCreateAndOpen(collectionPath, schema);
  }

  return collections[domain];
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Insert or update a vector in the specified domain collection.
 */
export function upsertVector(params: VectorInsertParams): void {
  const collection = getCollection(params.domain);
  collection.upsertSync({
    id: params.id,
    vectors: { embedding: params.embedding },
    fields: params.fields,
  });
}

/**
 * Batch insert vectors.
 */
export function upsertVectors(paramsList: VectorInsertParams[]): void {
  if (paramsList.length === 0) return;

  // Group by domain
  const byDomain = new Map<VectorDomain, VectorInsertParams[]>();
  for (const p of paramsList) {
    const list = byDomain.get(p.domain) || [];
    list.push(p);
    byDomain.set(p.domain, list);
  }

  for (const [domain, params] of byDomain) {
    const collection = getCollection(domain);
    const docs = params.map((p) => ({
      id: p.id,
      vectors: { embedding: p.embedding },
      fields: p.fields,
    }));
    collection.upsertSync(docs);
  }
}

/**
 * Search for similar vectors in the specified domain.
 */
export function searchVectors(params: VectorSearchParams): VectorSearchResult[] {
  const collection = getCollection(params.domain);
  const topK = params.topK ?? 10;

  const queryParams: Record<string, unknown> = {
    fieldName: 'embedding',
    vector: params.embedding,
    topk: topK,
    includeVector: false,
  };

  if (params.filter) {
    queryParams.filter = params.filter;
  }

  const results = collection.querySync(queryParams);

  return (results || [])
    .map((r: any) => ({
      id: r.id,
      score: r.score ?? r.distance ?? 0,
      fields: r.fields ?? {},
    }))
    .filter((r: VectorSearchResult) =>
      params.threshold ? r.score >= params.threshold : true
    );
}

/**
 * Delete vectors by ID from the specified domain.
 */
export function deleteVectors(params: VectorDeleteParams): void {
  if (!params.ids || params.ids.length === 0) return;
  const collection = getCollection(params.domain);
  collection.deleteSync(params.ids);
}

/**
 * Delete vectors matching a filter expression.
 */
export function deleteVectorsByFilter(params: VectorDeleteByFilterParams): void {
  const collection = getCollection(params.domain);
  collection.deleteByFilterSync(params.filter);
}

/**
 * Get stats for a domain collection.
 */
export function getVectorStats(domain: VectorDomain): VectorStats {
  try {
    const collection = getCollection(domain);
    const info = (collection as any).infoSync?.() || {};
    return { domain, count: info.count || info.total || 0 };
  } catch {
    return { domain, count: 0 };
  }
}
```

Create `lib/vectors/index.ts`:

```typescript
/**
 * Shared vector infrastructure for RAG, Memory, and CBP.
 */

export * from './types';
export * from './embedding-service';
export * from './vector-service';
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/ckaraca/Mns/pluggedin-app && pnpm test tests/vectors/vector-service.test.ts`

Expected: PASS

**Step 5: Run all vector tests**

Run: `cd /Users/ckaraca/Mns/pluggedin-app && pnpm test tests/vectors/`

Expected: All PASS

**Step 6: Commit**

```bash
cd /Users/ckaraca/Mns/pluggedin-app && git add lib/vectors/vector-service.ts lib/vectors/index.ts tests/vectors/vector-service.test.ts && git commit -m "$(cat <<'EOF'
feat(vectors): add shared vector service with domain-based collections

Unified zvec operations for RAG, Memory, and CBP systems.
Each domain gets its own collection with domain-specific fields.
Shared HNSW index config and embedding dimensions.
EOF
)"
```

---

## Task 4: Create Text Chunking Service

**Files:**
- Create: `lib/rag/chunking.ts`
- Test: `tests/rag/chunking.test.ts`

**Step 1: Write the test**

Create `tests/rag/chunking.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { splitTextIntoChunks } from '@/lib/rag/chunking';

describe('splitTextIntoChunks', () => {
  it('should split text into chunks of specified size', () => {
    const text = 'A'.repeat(2000);
    const chunks = splitTextIntoChunks(text, { chunkSize: 800, chunkOverlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(800 * 1.2); // Allow 20% overflow for overlap
    });
  });

  it('should not split short text', () => {
    const text = 'Hello, this is a short text.';
    const chunks = splitTextIntoChunks(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('should return empty array for empty text', () => {
    expect(splitTextIntoChunks('')).toHaveLength(0);
    expect(splitTextIntoChunks('   ')).toHaveLength(0);
  });

  it('should split on paragraph boundaries first', () => {
    const text = 'Paragraph one content here.\n\nParagraph two content here.\n\nParagraph three content here.';
    const chunks = splitTextIntoChunks(text, { chunkSize: 40, chunkOverlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should use default parameters', () => {
    const text = 'A'.repeat(2000);
    const chunks = splitTextIntoChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/ckaraca/Mns/pluggedin-app && pnpm test tests/rag/chunking.test.ts`

Expected: FAIL - Cannot find module `@/lib/rag/chunking`

**Step 3: Write the implementation**

Create `lib/rag/chunking.ts`:

```typescript
/**
 * Text chunking for RAG document processing.
 * Splits documents into overlapping chunks for vector embedding.
 */

interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
}

const DEFAULT_CHUNK_SIZE = 800;
const DEFAULT_CHUNK_OVERLAP = 100;
const DEFAULT_SEPARATORS = ['\n\n', '\n', '. ', ' ', ''];

/**
 * Split text into overlapping chunks using recursive character splitting.
 * Tries to split on natural boundaries (paragraphs > newlines > sentences > words).
 */
export function splitTextIntoChunks(
  text: string,
  options: ChunkOptions = {}
): string[] {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    chunkOverlap = DEFAULT_CHUNK_OVERLAP,
    separators = DEFAULT_SEPARATORS,
  } = options;

  if (!text || text.trim().length === 0) return [];
  if (text.length <= chunkSize) return [text];

  return recursiveSplit(text, separators, chunkSize, chunkOverlap);
}

function recursiveSplit(
  text: string,
  separators: string[],
  chunkSize: number,
  chunkOverlap: number
): string[] {
  const chunks: string[] = [];

  // Find the best separator that actually splits the text
  let separator = '';
  let splits: string[] = [text];

  for (const sep of separators) {
    if (sep === '') {
      splits = text.split('');
      separator = '';
      break;
    }
    if (text.includes(sep)) {
      splits = text.split(sep);
      separator = sep;
      break;
    }
  }

  // Merge splits into chunks of target size
  let currentChunk = '';
  const mergedSplits: string[] = [];

  for (const split of splits) {
    const piece = currentChunk ? currentChunk + separator + split : split;

    if (piece.length <= chunkSize) {
      currentChunk = piece;
    } else {
      if (currentChunk) mergedSplits.push(currentChunk);

      if (split.length > chunkSize) {
        const nextSeparators = separators.slice(separators.indexOf(separator) + 1);
        if (nextSeparators.length > 0) {
          mergedSplits.push(...recursiveSplit(split, nextSeparators, chunkSize, chunkOverlap));
          currentChunk = '';
          continue;
        }
      }
      currentChunk = split;
    }
  }

  if (currentChunk) mergedSplits.push(currentChunk);

  // Apply overlap between consecutive chunks
  for (let i = 0; i < mergedSplits.length; i++) {
    if (i === 0) {
      chunks.push(mergedSplits[i]);
    } else {
      const prevChunk = mergedSplits[i - 1];
      const overlapText = prevChunk.slice(-chunkOverlap);
      const withOverlap = overlapText + separator + mergedSplits[i];
      chunks.push(withOverlap.length <= chunkSize * 1.2 ? withOverlap : mergedSplits[i]);
    }
  }

  return chunks;
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/ckaraca/Mns/pluggedin-app && pnpm test tests/rag/chunking.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
cd /Users/ckaraca/Mns/pluggedin-app && git add lib/rag/chunking.ts tests/rag/chunking.test.ts && git commit -m "$(cat <<'EOF'
feat(rag): add text chunking service

Recursive character text splitter with configurable chunk size,
overlap, and separator hierarchy for RAG document processing.
EOF
)"
```

---

## Task 5: Add `document_chunks` Table to Schema

**Files:**
- Modify: `db/schema.ts` (add after docsRelations, around line 1070)
- Test: `tests/rag/schema.test.ts`

**Step 1: Write the test**

Create `tests/rag/schema.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { documentChunksTable } from '@/db/schema';

describe('documentChunksTable schema', () => {
  it('should export the table', () => {
    expect(documentChunksTable).toBeDefined();
  });

  it('should have the correct table name', () => {
    // Drizzle tables have a Symbol for table name
    const tableName = (documentChunksTable as any)[Symbol.for('drizzle:Name')];
    expect(tableName).toBe('document_chunks');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/ckaraca/Mns/pluggedin-app && pnpm test tests/rag/schema.test.ts`

Expected: FAIL - `documentChunksTable` is not exported from `@/db/schema`

**Step 3: Add the table to schema**

Find the `docsRelations` definition in `db/schema.ts` (around line 1057). Add the new table AFTER `docsRelations`:

```typescript
// ─── Document Chunks (RAG Vector Storage) ───────────────────────────

export const documentChunksTable = pgTable(
  'document_chunks',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    document_uuid: uuid('document_uuid')
      .notNull()
      .references(() => docsTable.uuid, { onDelete: 'cascade' }),
    project_uuid: uuid('project_uuid')
      .notNull()
      .references(() => projectsTable.uuid, { onDelete: 'cascade' }),
    chunk_index: integer('chunk_index').notNull(),
    chunk_text: text('chunk_text').notNull(),
    zvec_vector_id: varchar('zvec_vector_id', { length: 255 }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    documentChunksProjectIdx: index('document_chunks_project_uuid_idx').on(table.project_uuid),
    documentChunksDocumentIdx: index('document_chunks_document_uuid_idx').on(table.document_uuid),
    documentChunksZvecIdx: index('document_chunks_zvec_vector_id_idx').on(table.zvec_vector_id),
  })
);

export const documentChunksRelations = relations(documentChunksTable, ({ one }) => ({
  document: one(docsTable, {
    fields: [documentChunksTable.document_uuid],
    references: [docsTable.uuid],
  }),
  project: one(projectsTable, {
    fields: [documentChunksTable.project_uuid],
    references: [projectsTable.uuid],
  }),
}));
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/ckaraca/Mns/pluggedin-app && pnpm test tests/rag/schema.test.ts`

Expected: PASS

**Step 5: Generate and run migration**

Run:
```bash
cd /Users/ckaraca/Mns/pluggedin-app && pnpm db:generate
```

Expected: Migration file generated in `drizzle/` directory.

Run:
```bash
cd /Users/ckaraca/Mns/pluggedin-app && pnpm db:migrate
```

Expected: Migration applied successfully.

**Step 6: Commit**

```bash
cd /Users/ckaraca/Mns/pluggedin-app && git add db/schema.ts drizzle/ tests/rag/schema.test.ts && git commit -m "$(cat <<'EOF'
feat(rag): add document_chunks table for embedded RAG

Stores chunked document text with references to parent documents
and zvec vector IDs. CASCADE deletes for automatic cleanup.
EOF
)"
```

---

## Task 6: Rewrite RAG Service (HTTP → Embedded zvec)

**Files:**
- Modify: `lib/rag-service.ts` (complete rewrite)
- Test: `tests/rag/rag-service.test.ts`

**Step 1: Write the test**

Create `tests/rag/rag-service.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock vector service
vi.mock('@/lib/vectors/vector-service', () => ({
  upsertVectors: vi.fn(),
  searchVectors: vi.fn().mockReturnValue([
    { id: 'vec-1', score: 0.95, fields: { chunk_uuid: 'chunk-1', project_uuid: 'proj-1' } },
  ]),
  deleteVectorsByFilter: vi.fn(),
  getVectorStats: vi.fn().mockReturnValue({ domain: 'rag', count: 10 }),
}));

// Mock embedding service
vi.mock('@/lib/vectors/embedding-service', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(Array(1536).fill(0.1)),
  generateEmbeddings: vi.fn().mockResolvedValue([
    Array(1536).fill(0.1),
    Array(1536).fill(0.2),
  ]),
  EMBEDDING_DIMENSIONS: 1536,
}));

// Mock chunking
vi.mock('@/lib/rag/chunking', () => ({
  splitTextIntoChunks: vi.fn().mockReturnValue(['chunk 1 text', 'chunk 2 text']),
}));

// Mock database
vi.mock('@/db', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { uuid: 'chunk-uuid-1', zvec_vector_id: 'vec-1' },
          { uuid: 'chunk-uuid-2', zvec_vector_id: 'vec-2' },
        ]),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { uuid: 'chunk-1', chunk_text: 'chunk text', document_uuid: 'doc-1' },
        ]),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock('@/db/schema', () => ({
  documentChunksTable: { uuid: 'uuid', chunk_text: 'chunk_text', document_uuid: 'document_uuid', project_uuid: 'project_uuid' },
  docsTable: { uuid: 'uuid', name: 'name', rag_document_id: 'rag_document_id', project_uuid: 'project_uuid' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
  sql: vi.fn(),
}));

import { RagService } from '@/lib/rag-service';

describe('RagService (embedded zvec)', () => {
  let service: RagService;

  beforeEach(() => {
    process.env.ENABLE_RAG = 'true';
    service = new RagService();
  });

  it('should export RagService class', () => {
    expect(RagService).toBeDefined();
  });

  it('should check ENABLE_RAG flag', () => {
    expect(service.isEnabled()).toBe(true);
    process.env.ENABLE_RAG = 'false';
    service = new RagService();
    expect(service.isEnabled()).toBe(false);
  });

  it('should have queryForResponse method', () => {
    expect(typeof service.queryForResponse).toBe('function');
  });

  it('should have queryForContext method', () => {
    expect(typeof service.queryForContext).toBe('function');
  });

  it('should have processDocument method', () => {
    expect(typeof service.processDocument).toBe('function');
  });

  it('should have removeDocument method', () => {
    expect(typeof service.removeDocument).toBe('function');
  });

  it('should have getStorageStats method', () => {
    expect(typeof service.getStorageStats).toBe('function');
  });

  it('should return error when RAG is disabled', async () => {
    process.env.ENABLE_RAG = 'false';
    service = new RagService();
    const result = await service.queryForResponse('proj-1', 'test query');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not enabled');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/ckaraca/Mns/pluggedin-app && pnpm test tests/rag/rag-service.test.ts`

Expected: FAIL - `RagService` interface doesn't match (still HTTP-based)

**Step 3: Rewrite `lib/rag-service.ts`**

Replace the entire contents of `lib/rag-service.ts` with the embedded zvec implementation. Key changes:

1. Remove all HTTP fetch calls to `RAG_API_URL`
2. Remove SSRF validation (no external calls)
3. Remove retry logic (local operations don't need it)
4. Use `lib/vectors/vector-service.ts` for vector operations
5. Use `lib/vectors/embedding-service.ts` for embeddings
6. Use `lib/rag/chunking.ts` for text splitting
7. Use `document_chunks` table for chunk storage
8. Keep same public interface (backward compatible)

The new service should:
- Export `RagService` class and `ragService` singleton
- Keep `queryForResponse()`, `queryForContext()`, `getDocuments()`, `getStorageStats()` signatures
- Add `processDocument(documentUuid, projectUuid, text, fileName)` for direct processing
- Keep `uploadDocument()` for backward compatibility (wraps `processDocument`)
- Use LRU cache for storage stats
- Track upload progress via in-memory cache

**Important:** The exact implementation is in the design doc at `docs/plans/2026-02-28-rag-zvec-implementation.md` Task 7. Follow that implementation, but use `@/lib/vectors/vector-service` and `@/lib/vectors/embedding-service` instead of direct zvec calls.

**Step 4: Run test to verify it passes**

Run: `cd /Users/ckaraca/Mns/pluggedin-app && pnpm test tests/rag/rag-service.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
cd /Users/ckaraca/Mns/pluggedin-app && git add lib/rag-service.ts tests/rag/rag-service.test.ts && git commit -m "$(cat <<'EOF'
feat(rag): rewrite RAG service with embedded zvec vectors

Replace HTTP client (plugged_in_v3_server) with shared vector
infrastructure. Uses lib/vectors/ for embeddings and vector ops.
Maintains backward-compatible public API.
EOF
)"
```

---

## Task 7: Update Library Actions

**Files:**
- Modify: `app/actions/library.ts`

**Step 1: Update `processRagUpload` function**

In `app/actions/library.ts`, find the `processRagUpload` function (around line 507). Replace the HTTP upload with direct processing:

```typescript
// OLD (lines 507-536):
// const ragResponse = await ragService.uploadDocument(file, ragIdentifier);

// NEW:
import { readFile } from 'fs/promises';

// In processRagUpload, after file is saved to disk:
const fileContent = await readFile(filePath, 'utf-8');
const ragResponse = await ragService.processDocument(
  docRecord.uuid,
  projectUuid,
  fileContent,
  docRecord.name,
);
```

**Step 2: Update `getUploadStatus` function**

In `app/actions/library.ts`, find `getUploadStatus` (around line 569). Remove the `ragIdentifier` parameter:

```typescript
// OLD:
// const statusResult = await ragService.getUploadStatus(uploadId, ragIdentifier);

// NEW:
const statusResult = await ragService.getUploadStatus(uploadId);
```

**Step 3: Run existing tests**

Run: `cd /Users/ckaraca/Mns/pluggedin-app && pnpm test`

Expected: All existing tests pass

**Step 4: Commit**

```bash
cd /Users/ckaraca/Mns/pluggedin-app && git add app/actions/library.ts && git commit -m "$(cat <<'EOF'
refactor(rag): update library actions for embedded zvec service

Replace HTTP-based RAG upload with direct processDocument calls.
File content read from disk and processed in-process.
EOF
)"
```

---

## Task 8: Update Dockerfile

**Files:**
- Modify: `Dockerfile`

**Step 1: Add zvec data directory to runner stage**

In `Dockerfile`, find line 66 (`mkdir -p .next logs uploads`) and add `data/vectors`:

```dockerfile
# Create necessary directories with proper permissions
RUN mkdir -p .next logs uploads data/vectors && \
    chown -R nextjs:nodejs .next logs uploads data/vectors
```

**Step 2: Add native build tools to deps stage** (if zvec needs compilation)

In `Dockerfile`, find the `deps` stage (line 7). Add build tools:

```dockerfile
FROM base AS deps
WORKDIR /app

# Install native build tools for zvec bindings
RUN apk add --no-cache python3 make g++

# Files needed for pnpm install
COPY package.json pnpm-lock.yaml* ./
# Copy scripts directory for postinstall
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile
```

**Step 3: Verify build**

Run:
```bash
cd /Users/ckaraca/Mns/pluggedin-app && pnpm build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
cd /Users/ckaraca/Mns/pluggedin-app && git add Dockerfile && git commit -m "$(cat <<'EOF'
build: add zvec data directory and native build tools to Dockerfile

Create data/vectors directory for zvec collection storage.
Add python3/make/g++ for native addon compilation.
EOF
)"
```

---

## Task 9: Update Docker Compose

**Files:**
- Modify: `docker-compose.yml`

**Step 1: Update PostgreSQL image to pgvector**

Change `postgres:18-alpine` to `pgvector/pgvector:pg18` (line 36):

```yaml
  pluggedin-postgres:
    container_name: pluggedin-postgres
    image: pgvector/pgvector:pg18
```

**Step 2: Add zvec volume and RAG environment variables**

Add to `pluggedin-app` service volumes (after line 15):

```yaml
    volumes:
      - mcp-cache:/app/.cache
      - app-uploads:/app/uploads
      - app-logs:/app/logs
      - zvec-data:/app/data/vectors
    environment:
      # ... existing vars ...
      - ENABLE_RAG=true
      - ZVEC_DATA_PATH=/app/data/vectors
```

**Step 3: Add zvec-data to volumes section**

Add after `app-logs` volume (around line 105):

```yaml
volumes:
  pluggedin-postgres:
    driver: local
  pluggedin-redis:
    driver: local
  mcp-cache:
    driver: local
  app-uploads:
    driver: local
  app-logs:
    driver: local
  zvec-data:
    driver: local
```

**Step 4: Verify config**

Run:
```bash
cd /Users/ckaraca/Mns/pluggedin-app && docker compose config --quiet
```

Expected: No errors

**Step 5: Commit**

```bash
cd /Users/ckaraca/Mns/pluggedin-app && git add docker-compose.yml && git commit -m "$(cat <<'EOF'
build: add pgvector image, zvec volume, and RAG config to docker-compose

- Switch to pgvector/pgvector:pg18 (for memory system pgvector support)
- Add zvec-data volume for embedded vector storage
- Add ENABLE_RAG and ZVEC_DATA_PATH environment variables
EOF
)"
```

---

## Task 10: Update Environment Variables

**Files:**
- Modify: `.env.example`

**Step 1: Replace RAG_API_URL with ZVEC_DATA_PATH**

In `.env.example`, find `RAG_API_URL=` (line 142) and replace:

```bash
# OLD:
RAG_API_URL=

# NEW:
# Embedded Vector Storage (RAG + Memory)
ZVEC_DATA_PATH=./data/vectors
```

**Step 2: Search for remaining RAG_API_URL references**

Run:
```bash
cd /Users/ckaraca/Mns/pluggedin-app && grep -r "RAG_API_URL" --include="*.ts" --include="*.tsx" -l
```

Expected: No TypeScript files should reference `RAG_API_URL` (removed in Task 6). If any remain, update them.

**Step 3: Commit**

```bash
cd /Users/ckaraca/Mns/pluggedin-app && git add .env.example && git commit -m "$(cat <<'EOF'
chore: replace RAG_API_URL with ZVEC_DATA_PATH in environment config

RAG is now embedded using zvec - no external API needed.
ZVEC_DATA_PATH configures filesystem location for vector storage.
EOF
)"
```

---

## Task 11: Migrate Memory to Shared Vector Service

**Files:**
- Modify: `lib/memory/embedding-service.ts`
- Modify: `lib/memory/vector-service.ts`
- Modify: `lib/memory/constants.ts`

**Step 1: Update memory embedding service to re-export from shared**

Replace `lib/memory/embedding-service.ts` entirely:

```typescript
/**
 * Memory Embedding Service
 *
 * Re-exports from the shared vector embedding service.
 * Kept for backward compatibility with memory service imports.
 */

export {
  generateEmbedding,
  generateEmbeddings,
  estimateTokenCount,
} from '@/lib/vectors/embedding-service';
```

**Step 2: Update memory vector service to use shared infrastructure**

In `lib/memory/vector-service.ts`, update the imports and data path:

- Change `ZVEC_DATA_DIR` to use `process.env.ZVEC_DATA_PATH || process.env.MEMORY_VECTOR_DATA_DIR || path.join(process.cwd(), 'data', 'vectors')`
- The memory vector service can keep its domain-specific functions (`upsertFreshMemoryVector`, `searchFreshMemory`, etc.) since they provide higher-level abstractions, but should use the same data directory

Replace the data dir config (line 38-39):

```typescript
const ZVEC_DATA_DIR = process.env.ZVEC_DATA_PATH
  || process.env.MEMORY_VECTOR_DATA_DIR
  || path.join(process.cwd(), 'data', 'vectors');
```

**Step 3: Run memory tests**

Run: `cd /Users/ckaraca/Mns/pluggedin-app && pnpm test`

Expected: All tests pass

**Step 4: Commit**

```bash
cd /Users/ckaraca/Mns/pluggedin-app && git add lib/memory/embedding-service.ts lib/memory/vector-service.ts && git commit -m "$(cat <<'EOF'
refactor(memory): migrate to shared vector infrastructure

Memory embedding service re-exports from lib/vectors/.
Memory vector service uses unified ZVEC_DATA_PATH.
EOF
)"
```

---

## Task 12: Build Verification & Cleanup

**Step 1: Run full test suite**

Run: `cd /Users/ckaraca/Mns/pluggedin-app && pnpm test`

Expected: All tests pass (no regressions)

**Step 2: Run lint**

Run: `cd /Users/ckaraca/Mns/pluggedin-app && pnpm lint`

Expected: No lint errors

**Step 3: Run build**

Run: `cd /Users/ckaraca/Mns/pluggedin-app && pnpm build`

Expected: Build succeeds

**Step 4: Verify no RAG_API_URL references remain**

Run:
```bash
cd /Users/ckaraca/Mns/pluggedin-app && grep -r "RAG_API_URL" --include="*.ts" --include="*.tsx" --include="*.env*" -l
```

Expected: Only `.env` file (if it exists) - no TypeScript references

**Step 5: Code review**

Use `superpowers:requesting-code-review` to verify:
- Shared vector service correctly handles all domains
- RAG service backward compatibility maintained
- No security vulnerabilities introduced
- Memory system still works with unified data path
- Docker configuration correct

---

## Summary of All New/Modified Files

| # | File | Action |
|---|------|--------|
| 1 | `lib/vectors/types.ts` | **Created** - Shared vector types |
| 2 | `lib/vectors/embedding-service.ts` | **Created** - Unified embeddings |
| 3 | `lib/vectors/vector-service.ts` | **Created** - Unified zvec operations |
| 4 | `lib/vectors/index.ts` | **Created** - Re-exports |
| 5 | `lib/rag/chunking.ts` | **Created** - Text splitting |
| 6 | `lib/rag-service.ts` | **Rewritten** - HTTP → embedded zvec |
| 7 | `db/schema.ts` | **Modified** - Add document_chunks table |
| 8 | `app/actions/library.ts` | **Modified** - Direct processing |
| 9 | `Dockerfile` | **Modified** - zvec dirs + build tools |
| 10 | `docker-compose.yml` | **Modified** - pgvector + zvec volume |
| 11 | `.env.example` | **Modified** - ZVEC_DATA_PATH |
| 12 | `lib/memory/embedding-service.ts` | **Modified** - Re-export from shared |
| 13 | `lib/memory/vector-service.ts` | **Modified** - Unified data path |
| 14 | `tests/vectors/types.test.ts` | **Created** |
| 15 | `tests/vectors/embedding-service.test.ts` | **Created** |
| 16 | `tests/vectors/vector-service.test.ts` | **Created** |
| 17 | `tests/rag/chunking.test.ts` | **Created** |
| 18 | `tests/rag/schema.test.ts` | **Created** |
| 19 | `tests/rag/rag-service.test.ts` | **Created** |

Total: 7 new source files, 6 new test files, 6 modified files
