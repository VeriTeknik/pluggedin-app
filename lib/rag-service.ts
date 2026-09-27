/**
 * RAG (Retrieval-Augmented Generation) Service
 *
 * Embedded vector search using zvec via the shared vector infrastructure.
 * Replaces the old HTTP-based plugged_in_v3_server integration.
 *
 * Uses:
 * - lib/vectors/vector-service for vector storage and search
 * - lib/vectors/embedding-service for text → vector conversion
 * - lib/rag/chunking for document splitting
 * - document_chunks table for chunk text storage
 */

import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/db';
import { documentChunksTable, docsTable } from '@/db/schema';

import { LRUCache } from './lru-cache';
import { splitTextIntoChunks } from './rag/chunking';
import {
  calculateStorageFromVectorCount,
  estimateStorageFromDocumentCount,
} from './rag-storage-utils';
import {
  generateEmbedding,
  generateEmbeddings,
} from './vectors/embedding-service';
import {
  buildFilter,
  deleteVectorsByFilter,
  searchVectors,
  upsertVectors,
} from './vectors/vector-service';

/** Number of chunks to retrieve per query. Override via RAG_SEARCH_TOP_K env var. */
const RAG_SEARCH_TOP_K = parseInt(process.env.RAG_SEARCH_TOP_K || '5', 10);

// ─── Public Interfaces (backward compatible) ────────────────────────

export interface RagQueryResponse {
  success: boolean;
  response?: string;
  context?: string;
  sources?: string[];
  documentIds?: string[];
  error?: string;
}

export interface RagDocumentsResponse {
  success: boolean;
  documents?: Array<[string, string]>; // [filename, document_id] pairs
  error?: string;
}

export interface RagStorageStatsResponse {
  success: boolean;
  documentsCount?: number;
  totalChunks?: number;
  estimatedStorageMb?: number;
  vectorsCount?: number;
  embeddingDimension?: number;
  error?: string;
  isEstimate?: boolean;
}

// ─── RAG Service Class ──────────────────────────────────────────────

export class RagService {
  private storageStatsCache: LRUCache<RagStorageStatsResponse>;

  constructor() {
    const cacheTtl = parseInt(process.env.RAG_CACHE_TTL_MS || '60000', 10);
    this.storageStatsCache = new LRUCache<RagStorageStatsResponse>(100, cacheTtl);
  }

  isEnabled(): boolean {
    return process.env.ENABLE_RAG === 'true';
  }

  // ─── Query Methods ─────────────────────────────────────────────────

  async queryForContext(query: string, ragIdentifier: string): Promise<RagQueryResponse> {
    return this.queryForResponse(ragIdentifier, query);
  }

  async queryForResponse(ragIdentifier: string, query: string): Promise<RagQueryResponse> {
    try {
      if (!this.isEnabled()) {
        return { success: false, error: 'RAG is not enabled' };
      }

      if (!query || query.length > 10 * 1024) {
        return { success: false, error: query ? 'Query too large. Maximum size is 10KB' : 'Query cannot be empty' };
      }

      // buildFilter drops an empty value, and no filter at all is a search
      // across every Hub. Fail closed instead.
      const filter = buildFilter([['project_uuid', ragIdentifier]]);
      if (!filter) {
        return { success: false, error: 'A Hub is required to query documents' };
      }

      // Generate query embedding
      const embedding = await generateEmbedding(query);

      // Search zvec via shared vector service
      const results = searchVectors({
        embedding,
        domain: 'rag',
        topK: RAG_SEARCH_TOP_K,
        filter,
      });

      if (results.length === 0) {
        return {
          success: true,
          response: 'No relevant documents found',
          sources: [],
          documentIds: [],
        };
      }

      const chunkUuids = results
        .map((r) => r.fields.chunk_uuid)
        .filter(Boolean);

      if (chunkUuids.length === 0) {
        return {
          success: true,
          response: 'No relevant documents found',
          sources: [],
          documentIds: [],
        };
      }

      // The Hub is checked again here, against PostgreSQL. A vector carries
      // its own copy of project_uuid, and when that copy is stale - a
      // document moved between Hubs, or any other drift - the vector filter
      // alone would hand this Hub another Hub's text.
      const chunkRows = await db
        .select({
          uuid: documentChunksTable.uuid,
          chunk_text: documentChunksTable.chunk_text,
          document_uuid: documentChunksTable.document_uuid,
        })
        .from(documentChunksTable)
        .where(and(
          inArray(documentChunksTable.uuid, chunkUuids),
          eq(documentChunksTable.project_uuid, ragIdentifier),
        ));

      // Re-order chunks by vector search score (highest relevance first)
      const chunkMap = new Map(chunkRows.map((c) => [c.uuid, c]));
      const chunks = chunkUuids
        .map((uuid) => chunkMap.get(uuid))
        .filter(Boolean) as typeof chunkRows;

      // Build context from score-ordered chunks
      const context = chunks.map((c) => c.chunk_text).join('\n\n---\n\n');

      // Get unique document names
      const docUuids = [...new Set(chunks.map((c) => c.document_uuid))];
      const docs = docUuids.length > 0
        ? await db
            .select({ uuid: docsTable.uuid, name: docsTable.name })
            .from(docsTable)
            .where(and(
              inArray(docsTable.uuid, docUuids),
              eq(docsTable.project_uuid, ragIdentifier),
            ))
        : [];

      return {
        success: true,
        response: context,
        context,
        sources: docs.map((d) => d.name),
        documentIds: docs.map((d) => d.uuid),
      };
    } catch (error) {
      console.error('[RAG Service] Query error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Query failed',
      };
    }
  }

  // ─── Document Processing ──────────────────────────────────────────

  async processDocument(
    documentUuid: string,
    projectUuid: string,
    text: string,
    _fileName: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.isEnabled()) {
        return { success: false, error: 'RAG is not enabled' };
      }

      // Step 1: Chunk text
      const chunkTexts = splitTextIntoChunks(text);
      if (chunkTexts.length === 0) {
        return { success: false, error: 'No text content found' };
      }

      // Step 2: Generate embeddings
      const embeddings = await generateEmbeddings(chunkTexts);
      if (embeddings.length !== chunkTexts.length) {
        return {
          success: false,
          error: `Embedding count mismatch: expected ${chunkTexts.length}, got ${embeddings.length}`,
        };
      }

      // Step 3: Clean up any existing chunks for this document (idempotent re-processing)
      const existingFilter = buildFilter([['document_uuid', documentUuid]]);
      if (existingFilter) {
        deleteVectorsByFilter({ domain: 'rag', filter: existingFilter });
      }
      await db
        .delete(documentChunksTable)
        .where(eq(documentChunksTable.document_uuid, documentUuid));

      // Step 4: Insert chunks to PostgreSQL
      const chunkRecords = chunkTexts.map((chunkText, i) => ({
        document_uuid: documentUuid,
        project_uuid: projectUuid,
        chunk_index: i,
        chunk_text: chunkText,
        zvec_vector_id: `${documentUuid}-${i}`,
      }));

      const insertedChunks = await db
        .insert(documentChunksTable)
        .values(chunkRecords)
        .returning({ uuid: documentChunksTable.uuid });

      // Step 5: Validate DB returned all chunk UUIDs
      if (insertedChunks.length !== chunkTexts.length) {
        // Partial insert - clean up and fail rather than create phantom vectors
        await db
          .delete(documentChunksTable)
          .where(eq(documentChunksTable.document_uuid, documentUuid));
        return {
          success: false,
          error: `Chunk insert mismatch: expected ${chunkTexts.length}, got ${insertedChunks.length}`,
        };
      }

      // Step 6: Insert vectors to zvec via shared vector service.
      // If this fails, clean up PG rows to maintain atomicity.
      try {
        const vectorParams = embeddings.map((emb, i) => ({
          id: `${documentUuid}-${i}`,
          embedding: emb,
          domain: 'rag' as const,
          fields: {
            project_uuid: projectUuid,
            document_uuid: documentUuid,
            chunk_uuid: insertedChunks[i].uuid,
          },
        }));

        upsertVectors(vectorParams);
      } catch (zvecError) {
        // Roll back PG chunks to avoid orphaned rows
        await db
          .delete(documentChunksTable)
          .where(eq(documentChunksTable.document_uuid, documentUuid));
        throw zvecError;
      }

      // Invalidate storage cache
      this.invalidateStorageCache(projectUuid);

      return { success: true };
    } catch (error) {
      console.error('[RAG Service] Process document error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Processing failed',
      };
    }
  }

  // ─── Document Management ─────────────────────────────────────────

  /**
   * Remove a document's vectors and chunks, inside one Hub.
   *
   * Both deletes are scoped by the Hub as well as the document. Removal by
   * document uuid alone let anyone who got a foreign uuid in front of this -
   * a writable rag pointer did - erase another Hub's index. No Hub, no
   * removal.
   */
  async removeDocument(documentId: string, projectUuid: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.isEnabled()) return { success: true };
      if (!documentId) return { success: true }; // Nothing to remove
      if (!projectUuid) {
        return { success: false, error: 'A Hub is required to remove a document' };
      }

      // Delete vectors from zvec
      const filter = buildFilter([
        ['document_uuid', documentId],
        ['project_uuid', projectUuid],
      ]);
      if (filter) {
        deleteVectorsByFilter({ domain: 'rag', filter });
      }

      // Delete chunks from PostgreSQL (also handled by CASCADE on doc delete)
      await db
        .delete(documentChunksTable)
        .where(and(
          eq(documentChunksTable.document_uuid, documentId),
          eq(documentChunksTable.project_uuid, projectUuid),
        ));

      return { success: true };
    } catch (error) {
      console.error('[RAG Service] Remove error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Remove failed',
      };
    }
  }

  /**
   * Whether the document has chunks indexed in the given Hub - the only
   * evidence that justifies pointing its rag_document_id at itself.
   */
  async hasIndexedChunks(documentId: string, projectUuid: string): Promise<boolean> {
    if (!documentId || !projectUuid) return false;

    const rows = await db
      .select({ uuid: documentChunksTable.uuid })
      .from(documentChunksTable)
      .where(and(
        eq(documentChunksTable.document_uuid, documentId),
        eq(documentChunksTable.project_uuid, projectUuid),
      ))
      .limit(1);

    return rows.length > 0;
  }

  async getDocuments(ragIdentifier: string): Promise<RagDocumentsResponse> {
    try {
      if (!this.isEnabled()) {
        return { success: false, error: 'RAG is not enabled' };
      }

      const docs = await db
        .select({
          name: docsTable.name,
          rag_document_id: docsTable.rag_document_id,
        })
        .from(docsTable)
        .where(
          and(
            eq(docsTable.project_uuid, ragIdentifier),
            isNotNull(docsTable.rag_document_id),
          ),
        );

      const documents: Array<[string, string]> = docs.map((d) => [
        d.name,
        d.rag_document_id!,
      ]);

      return { success: true, documents };
    } catch (error) {
      console.error('[RAG Service] Get documents error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch documents',
      };
    }
  }

  async getStorageStats(ragIdentifier: string): Promise<RagStorageStatsResponse> {
    try {
      if (!this.isEnabled()) {
        return { success: false, error: 'RAG is not enabled' };
      }

      const cacheKey = `storage-stats-${ragIdentifier}`;
      const cached = this.storageStatsCache.get(cacheKey);
      if (cached) return cached;

      // Get per-project chunk count from PostgreSQL (authoritative per-project count)
      const chunkCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(documentChunksTable)
        .where(eq(documentChunksTable.project_uuid, ragIdentifier));

      // Use project-specific chunk count, not collection-wide getVectorStats
      // which returns counts across ALL projects sharing the RAG collection.
      const vectorCount = Number(chunkCountResult[0]?.count || 0);

      let result: RagStorageStatsResponse;
      if (vectorCount > 0) {
        const docsResult = await this.getDocuments(ragIdentifier);
        const documentsCount = docsResult.documents?.length || 0;
        result = {
          success: true,
          ...calculateStorageFromVectorCount(vectorCount, documentsCount),
        };
      } else {
        result = {
          success: true,
          ...estimateStorageFromDocumentCount(0),
        };
      }

      this.storageStatsCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('[RAG Service] Storage stats error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get storage statistics',
      };
    }
  }

  invalidateStorageCache(ragIdentifier: string): void {
    this.storageStatsCache.delete(`storage-stats-${ragIdentifier}`);
  }

  clearStorageCache(): void {
    this.storageStatsCache.clear();
  }

  destroy(): void {
    this.storageStatsCache.destroy();
  }
}

// Export singleton instance (backward compatible)
export const ragService = new RagService();
