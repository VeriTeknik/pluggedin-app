#!/usr/bin/env tsx
/**
 * Rebuilds the zvec `rag` collection from PostgreSQL `document_chunks`.
 *
 * Re-runnable. For each chunk it generates an embedding from `chunk_text`
 * and upserts a vector keyed by `${document_uuid}-${chunk_index}`. Per-document
 * vectors are deleted before re-insert so the collection stays in sync with PG
 * even if chunk counts changed.
 *
 * Usage:
 *   pnpm reindex:rag
 *   pnpm reindex:rag -- --dry
 *   pnpm reindex:rag -- --doc=<uuid>
 *   pnpm reindex:rag -- --project=<uuid>
 *   pnpm reindex:rag -- --batch=8
 *
 * zvec holds a single-writer RocksDB lock per collection path. The script writes
 * to ZVEC_DATA_PATH, which (in production) is a different path than the one the
 * running service had on startup — so it can run while the service is up. After
 * a service restart picks up the new env, the populated collection becomes live.
 *
 * Note: this script does not import lib/vectors/vector-service because that
 * module uses named ESM imports from `@zvec/zvec` (a CJS package) which fails
 * under direct tsx execution. The collection schema is replicated here.
 */

import { config } from 'dotenv';
config();

import { existsSync, renameSync, rmSync } from 'fs';
import path from 'path';

import { and, asc, eq } from 'drizzle-orm';

// CJS default import — works under Node ESM regardless of named-export visibility.
import zvecPkg from '@zvec/zvec';

const {
  ZVecCollectionSchema,
  ZVecCreateAndOpen,
  ZVecDataType,
  ZVecIndexType,
  ZVecInitialize,
  ZVecMetricType,
  ZVecOpen,
} = zvecPkg as any;

// ─── CLI ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry') || args.includes('--dry-run');
const docFilter = args.find((a) => a.startsWith('--doc='))?.split('=')[1];
const projectFilter = args.find((a) => a.startsWith('--project='))?.split('=')[1];
const batchArg = args.find((a) => a.startsWith('--batch='))?.split('=')[1];
const BATCH_SIZE = batchArg ? Math.max(1, parseInt(batchArg, 10)) : 16;

const fmt = (n: number) => n.toLocaleString('en-US');

// ─── zvec collection management (rag-only, mirrors vector-service.ts) ─────

const RAG_DOMAIN = 'rag';
const INVERT_INDEX = { indexType: ZVecIndexType.INVERT } as const;

function resolveDataDir(): string {
  const raw =
    process.env.ZVEC_DATA_PATH ||
    process.env.MEMORY_VECTOR_DATA_DIR ||
    path.join(process.cwd(), 'data', 'vectors');
  return path.resolve(raw);
}

function ragCollectionSchema(dim: number) {
  return new ZVecCollectionSchema({
    name: RAG_DOMAIN,
    vectors: {
      name: 'embedding',
      dataType: ZVecDataType.VECTOR_FP32,
      dimension: dim,
      indexParams: {
        indexType: ZVecIndexType.HNSW,
        metricType: ZVecMetricType.COSINE,
      },
    },
    fields: [
      { name: 'project_uuid', dataType: ZVecDataType.STRING, indexParams: INVERT_INDEX },
      { name: 'document_uuid', dataType: ZVecDataType.STRING, indexParams: INVERT_INDEX },
      { name: 'chunk_uuid', dataType: ZVecDataType.STRING, indexParams: INVERT_INDEX },
    ],
  });
}

function openOrCreateRagCollection(dataDir: string, dim: number) {
  ZVecInitialize({ logLevel: 2 });
  const collectionPath = path.join(dataDir, RAG_DOMAIN);

  try {
    return ZVecOpen(collectionPath);
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg.includes('lock hold by') || msg.includes('No locks available')) {
      throw new Error(
        `zvec lock at ${collectionPath} is held by another process. ` +
          'Stop the pluggedin service or point ZVEC_DATA_PATH at a different directory.',
      );
    }
    // Missing/invalid collection — back up if anything exists, then create fresh
    if (existsSync(collectionPath)) {
      const backup = `${collectionPath}.bak`;
      if (existsSync(backup)) rmSync(backup, { recursive: true });
      try {
        renameSync(collectionPath, backup);
        console.warn(`[reindex-rag] backed up existing collection to ${backup}`);
      } catch {
        rmSync(collectionPath, { recursive: true });
      }
    }
    return ZVecCreateAndOpen(collectionPath, ragCollectionSchema(dim));
  }
}

// ─── Filter builder (UUID-only here; mirrors vector-service.ts safety) ────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidFilter(field: string, value: string): string {
  if (!UUID_REGEX.test(value)) {
    throw new Error(`invalid UUID for ${field}: ${value}`);
  }
  return `${field} = "${value}"`;
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const dataDir = resolveDataDir();
  const dim = Number(process.env.EMBEDDING_DIMENSIONS) || 768;

  console.log('[reindex-rag] starting');
  console.log(`  ZVEC_DATA_PATH=${dataDir}`);
  console.log(`  EMBEDDING_PROVIDER=${process.env.EMBEDDING_PROVIDER || 'openai'}`);
  console.log(`  EMBEDDING_MODEL=${process.env.EMBEDDING_MODEL || '(default)'}`);
  console.log(`  EMBEDDING_DIMENSIONS=${dim}`);
  console.log(
    `  batchSize=${BATCH_SIZE} dryRun=${isDryRun}` +
      (docFilter ? ` doc=${docFilter}` : '') +
      (projectFilter ? ` project=${projectFilter}` : ''),
  );

  // Late dynamic imports so module-level code that reads env (if any) sees dotenv values.
  const { db } = await import('@/db');
  const { documentChunksTable } = await import('@/db/schema');
  const { generateEmbeddings } = await import('@/lib/vectors/embedding-service');

  const whereClauses = [];
  if (docFilter) whereClauses.push(eq(documentChunksTable.document_uuid, docFilter));
  if (projectFilter) whereClauses.push(eq(documentChunksTable.project_uuid, projectFilter));

  const baseQuery = db
    .select({
      uuid: documentChunksTable.uuid,
      document_uuid: documentChunksTable.document_uuid,
      project_uuid: documentChunksTable.project_uuid,
      chunk_index: documentChunksTable.chunk_index,
      chunk_text: documentChunksTable.chunk_text,
    })
    .from(documentChunksTable)
    .orderBy(asc(documentChunksTable.document_uuid), asc(documentChunksTable.chunk_index));

  const chunks = whereClauses.length
    ? await baseQuery.where(and(...whereClauses))
    : await baseQuery;

  if (chunks.length === 0) {
    console.log('[reindex-rag] no chunks matched, nothing to do');
    return;
  }

  const byDocument = new Map<string, typeof chunks>();
  for (const c of chunks) {
    const list = byDocument.get(c.document_uuid) ?? [];
    list.push(c);
    byDocument.set(c.document_uuid, list);
  }
  console.log(`[reindex-rag] ${fmt(chunks.length)} chunks across ${byDocument.size} documents`);

  // Open collection only once we know we have work to do.
  const collection = openOrCreateRagCollection(dataDir, dim);
  const initialCount = collection.stats.docCount ?? 0;
  console.log(`[reindex-rag] initial rag vector count: ${fmt(initialCount)}`);

  let totalProcessed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let docsDone = 0;
  const startedAt = Date.now();

  for (const [documentUuid, docChunks] of byDocument) {
    docsDone++;
    const projectUuid = docChunks[0].project_uuid;
    const tag = `[${docsDone}/${byDocument.size}] doc=${documentUuid.slice(0, 8)} project=${projectUuid.slice(0, 8)}`;

    try {
      if (!isDryRun) {
        collection.deleteByFilterSync(uuidFilter('document_uuid', documentUuid));
      }

      let docProcessed = 0;
      let docSkipped = 0;

      for (let i = 0; i < docChunks.length; i += BATCH_SIZE) {
        const batch = docChunks.slice(i, i + BATCH_SIZE);
        const usable = batch.filter((c) => c.chunk_text && c.chunk_text.trim().length > 0);
        docSkipped += batch.length - usable.length;
        if (usable.length === 0) continue;

        const embeddings = await generateEmbeddings(usable.map((c) => c.chunk_text));
        if (embeddings.length !== usable.length) {
          throw new Error(`embedding count mismatch: expected ${usable.length}, got ${embeddings.length}`);
        }

        if (!isDryRun) {
          collection.upsertSync(
            usable.map((c, idx) => ({
              id: `${c.document_uuid}-${c.chunk_index}`,
              vectors: { embedding: embeddings[idx] },
              fields: {
                project_uuid: c.project_uuid,
                document_uuid: c.document_uuid,
                chunk_uuid: c.uuid,
              },
            })),
          );
        }

        docProcessed += usable.length;
        totalProcessed += usable.length;
      }

      totalSkipped += docSkipped;
      const skipNote = docSkipped > 0 ? ` (${docSkipped} skipped: empty text)` : '';
      console.log(`${tag} ok chunks=${docProcessed}/${docChunks.length}${skipNote}`);
    } catch (err) {
      totalFailed += docChunks.length;
      console.error(`${tag} FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  // One final HNSW build over everything we inserted — cheaper than per-batch.
  if (!isDryRun && totalProcessed > 0) {
    try {
      collection.optimizeSync();
    } catch (err) {
      console.warn('[reindex-rag] optimizeSync warning:', err instanceof Error ? err.message : err);
    }
  }

  const finalCount = collection.stats.docCount ?? 0;
  try {
    collection.closeSync();
  } catch {
    /* ignore */
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log('[reindex-rag] done');
  console.log(`  processed: ${fmt(totalProcessed)} chunks`);
  console.log(`  skipped:   ${fmt(totalSkipped)} chunks (empty text)`);
  console.log(`  failed:    ${fmt(totalFailed)} chunks`);
  console.log(`  vectors:   ${fmt(initialCount)} -> ${fmt(finalCount)}`);
  console.log(`  elapsed:   ${elapsed}s`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[reindex-rag] fatal:', err);
    process.exit(1);
  });
