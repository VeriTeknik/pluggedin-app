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

import { randomUUID } from 'crypto';

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
  getVectorStats,
  searchVectors,
  upsertVectors,
} from './vectors/vector-service';

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

export interface RagUploadResponse {
  success: boolean;
  upload_id?: string;
  error?: string;
}

export interface UploadProgress {
  status: 'processing' | 'completed' | 'failed';
  progress: {
    current: number;
    total: number;
    step: string;
    step_progress: { percentage: number };
  };
  message: string;
  document_id?: string;
}

export interface UploadStatusResponse {
  success: boolean;
  progress?: UploadProgress;
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

export interface RAGDocumentRequest {
  id: string;
  title: string;
  content: string;
  metadata?: {
    filename: string;
    mimeType: string;
    fileSize: number;
    tags: string[];
    userId: string;
    profileUuid?: string;
  };
}

// ─── Upload Progress Tracking ────────────────────────────────────────

const uploadProgressCache = new LRUCache<UploadProgress>(1000, 15 * 60 * 1000); // 15 min TTL

// ─── Helpers ─────────────────────────────────────────────────────────

function makeProgress(
  status: UploadProgress['status'],
  step: string,
  percentage: number,
  message: string,
  documentId?: string,
): UploadProgress {
  return {
    status,
    progress: {
      current: percentage,
      total: 100,
      step,
      step_progress: { percentage },
    },
    message,
    document_id: documentId,
  };
}

// ─── RAG Service Class ──────────────────────────────────────────────

export class RagService {
  private storageStatsCache: LRUCache<RagStorageStatsResponse>;

  constructor() {
    const cacheTtl = parseInt(process.env.RAG_CACHE_TTL_MS || '60000', 10);
    this.storageStatsCache = new LRUCache<RagStorageStatsResponse>(1000, cacheTtl);
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

      // Generate query embedding
      const embedding = await generateEmbedding(query);

      // Search zvec via shared vector service
      const results = searchVectors({
        embedding,
        domain: 'rag',
        topK: 5,
        filter: buildFilter([['project_uuid', ragIdentifier]]),
      });

      if (results.length === 0) {
        return {
          success: true,
          response: 'No relevant documents found',
          sources: [],
          documentIds: [],
        };
      }

      // Fetch chunk texts from PostgreSQL
      const { db } = await import('@/db');
      const { documentChunksTable, docsTable } = await import('@/db/schema');
      const { inArray } = await import('drizzle-orm');

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

      const chunkRows = await db
        .select({
          uuid: documentChunksTable.uuid,
          chunk_text: documentChunksTable.chunk_text,
          document_uuid: documentChunksTable.document_uuid,
        })
        .from(documentChunksTable)
        .where(inArray(documentChunksTable.uuid, chunkUuids));

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
            .where(inArray(docsTable.uuid, docUuids))
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
  ): Promise<{ success: boolean; uploadId?: string; error?: string }> {
    const uploadId = randomUUID();

    try {
      if (!this.isEnabled()) {
        return { success: false, error: 'RAG is not enabled' };
      }

      // Track progress
      uploadProgressCache.set(uploadId, makeProgress('processing', 'chunking', 10, 'Splitting document into chunks...'));

      // Step 1: Chunk text
      const chunkTexts = splitTextIntoChunks(text);
      if (chunkTexts.length === 0) {
        uploadProgressCache.set(uploadId, makeProgress('failed', 'chunking', 0, 'No text content found in document'));
        return { success: false, uploadId, error: 'No text content found' };
      }

      uploadProgressCache.set(uploadId, makeProgress('processing', 'embeddings', 30, `Generating embeddings for ${chunkTexts.length} chunks...`));

      // Step 2: Generate embeddings
      const embeddings = await generateEmbeddings(chunkTexts);

      uploadProgressCache.set(uploadId, makeProgress('processing', 'vector_storage', 60, 'Storing vectors...'));

      // Step 3: Insert chunks to PostgreSQL
      const { db } = await import('@/db');
      const { documentChunksTable } = await import('@/db/schema');

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

      // Step 4: Insert vectors to zvec via shared vector service
      const vectorParams = embeddings.map((emb, i) => ({
        id: `${documentUuid}-${i}`,
        embedding: emb,
        domain: 'rag' as const,
        fields: {
          project_uuid: projectUuid,
          document_uuid: documentUuid,
          chunk_uuid: insertedChunks[i]?.uuid || `${documentUuid}-chunk-${i}`,
        },
      }));

      upsertVectors(vectorParams);

      uploadProgressCache.set(uploadId, makeProgress('completed', 'completed', 100, 'Document processed successfully', documentUuid));

      // Invalidate storage cache
      this.invalidateStorageCache(projectUuid);

      return { success: true, uploadId };
    } catch (error) {
      console.error('[RAG Service] Process document error:', error);
      uploadProgressCache.set(uploadId, makeProgress('failed', 'vector_storage', 0, error instanceof Error ? error.message : 'Processing failed'));
      return {
        success: false,
        uploadId,
        error: error instanceof Error ? error.message : 'Processing failed',
      };
    }
  }

  // Backward-compatible upload method
  async uploadDocument(file: File, ragIdentifier: string): Promise<RagUploadResponse> {
    try {
      const text = await file.text();
      const result = await this.processDocument(
        randomUUID(),
        ragIdentifier,
        text,
        file.name,
      );
      return {
        success: result.success,
        upload_id: result.uploadId,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  // ─── Status & Stats ────────────────────────────────────────────────

  async getUploadStatus(uploadId: string, _ragIdentifier?: string): Promise<UploadStatusResponse> {
    const progress = uploadProgressCache.get(uploadId);
    if (!progress) {
      return { success: false, error: 'Upload not found - may have completed' };
    }
    return { success: true, progress };
  }

  async removeDocument(documentId: string, _ragIdentifier: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.isEnabled()) return { success: true };

      // Delete vectors from zvec
      deleteVectorsByFilter({
        domain: 'rag',
        filter: buildFilter([['document_uuid', documentId]])!,
      });

      // Delete chunks from PostgreSQL (also handled by CASCADE on doc delete)
      const { db } = await import('@/db');
      const { documentChunksTable } = await import('@/db/schema');
      const { eq } = await import('drizzle-orm');

      await db
        .delete(documentChunksTable)
        .where(eq(documentChunksTable.document_uuid, documentId));

      return { success: true };
    } catch (error) {
      console.error('[RAG Service] Remove error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Remove failed',
      };
    }
  }

  async getDocuments(ragIdentifier: string): Promise<RagDocumentsResponse> {
    try {
      if (!this.isEnabled()) {
        return { success: false, error: 'RAG is not enabled' };
      }

      const { db } = await import('@/db');
      const { docsTable } = await import('@/db/schema');
      const { eq, isNotNull, and } = await import('drizzle-orm');

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

      // Get vector count from zvec
      const stats = getVectorStats('rag');

      // Get document count from PostgreSQL
      const { db } = await import('@/db');
      const { documentChunksTable } = await import('@/db/schema');
      const { eq, sql } = await import('drizzle-orm');

      const chunkCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(documentChunksTable)
        .where(eq(documentChunksTable.project_uuid, ragIdentifier));

      const totalChunks = Number(chunkCountResult[0]?.count || 0);
      const vectorCount = stats.count || totalChunks;

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
