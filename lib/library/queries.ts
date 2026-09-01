/**
 * Document reads, taking the owning user id explicitly.
 *
 * These live outside app/actions/library.ts on purpose. Every export in a
 * `'use server'` file is a public HTTP endpoint, so an exported function that
 * accepts a `userId` lets any caller name whose documents to read. That is what
 * getDocs -> getDocumentVersions was: enumerate a victim's documents by user
 * id, then read their version rows, content_diff and all.
 *
 * Callers here must have established the identity themselves — the MCP
 * connector resolves it from an API key, the download route from an API key or
 * a session. Browser callers go through app/actions/library.ts, which takes no
 * user id and derives it from the session.
 */

import { and, desc, eq, sum } from 'drizzle-orm';

import { db } from '@/db';
import { docsTable, documentVersionsTable, projectsTable } from '@/db/schema';
import { ragService } from '@/lib/rag-service';
import type { Doc, DocListResponse } from '@/types/library';


export async function getDocsFor(userId: string, projectUuid?: string): Promise<DocListResponse> {
  try {
    let docs;

    if (projectUuid) {
      // Get documents specifically for this project
      docs = await db.query.docsTable.findMany({
        where: and(
          eq(docsTable.user_id, userId),
          eq(docsTable.project_uuid, projectUuid)
        ),
        orderBy: [desc(docsTable.created_at)],
      });
    } else {
      // Fallback: get all documents for user
      docs = await db.query.docsTable.findMany({
        where: eq(docsTable.user_id, userId),
        orderBy: [desc(docsTable.created_at)],
      });
    }

    return {
      success: true,
      docs: docs.map(doc => ({
        ...doc,
        source: doc.source as 'upload' | 'ai_generated' | 'api',
        visibility: doc.visibility as 'private' | 'workspace' | 'public',
        created_at: new Date(doc.created_at),
        updated_at: new Date(doc.updated_at),
      })),
    };
  } catch (error) {
    console.error('Error fetching docs:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch documents',
    };
  }
}

export async function getDocByUuidFor(userId: string, docUuid: string, projectUuid?: string): Promise<Doc | null> {
  try {
    // Check if user owns the document directly OR if it's a project-level document
    let doc;

    if (projectUuid) {
      // If projectUuid is provided, look for documents that either:
      // 1. Belong to the user directly in this project
      // 2. Are project-level documents (profile_uuid is NULL) in this project
      doc = await db.query.docsTable.findFirst({
        where: and(
          eq(docsTable.uuid, docUuid),
          eq(docsTable.project_uuid, projectUuid),
          eq(docsTable.user_id, userId)
        ),
      });
    } else {
      // If no projectUuid, just check user ownership
      doc = await db.query.docsTable.findFirst({
        where: and(
          eq(docsTable.uuid, docUuid),
          eq(docsTable.user_id, userId)
        ),
      });
    }

    if (!doc) {
      return null;
    }

    return {
      ...doc,
      source: doc.source as 'upload' | 'ai_generated' | 'api',
      visibility: doc.visibility as 'private' | 'workspace' | 'public',
      created_at: new Date(doc.created_at),
      updated_at: new Date(doc.updated_at),
    };
  } catch (error) {
    console.error('Error fetching doc:', error);
    return null;
  }
}

export async function getDocumentVersionsFor(userId: string, documentId: string, projectUuid?: string) {
  try {
    // First verify the user has access to this document
    const doc = await getDocByUuidFor(userId, documentId, projectUuid);

    if (!doc) {
      return {
        success: false,
        error: 'Document not found or access denied',
      };
    }

    // Fetch version history
    const versions = await db
      .select()
      .from(documentVersionsTable)
      .where(eq(documentVersionsTable.document_id, documentId))
      .orderBy(desc(documentVersionsTable.version_number));

    return {
      success: true,
      versions: versions.map(v => ({
        versionNumber: v.version_number,
        createdAt: v.created_at,
        createdByModel: v.created_by_model,
        changeSummary: v.change_summary,
        contentDiff: v.content_diff,
      })),
    };
  } catch (error) {
    console.error('Error fetching document versions:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch document versions',
    };
  }
}

/** Per-workspace storage ceiling. */
export const WORKSPACE_STORAGE_LIMIT = 100 * 1024 * 1024; // 100 MB in bytes

interface ProjectStorageUsage {
  success: boolean;
  fileStorage: number;
  ragStorage: number;
  totalUsage: number;
  limit: number;
  ragStorageAvailable?: boolean;
  warnings?: string[];
  error?: string;
}

function emptyUsage(error: string): ProjectStorageUsage {
  return {
    success: false,
    fileStorage: 0,
    ragStorage: 0,
    totalUsage: 0,
    limit: WORKSPACE_STORAGE_LIMIT,
    error,
  };
}

/**
 * Storage totals for one user, optionally narrowed to one of their projects.
 *
 * The document total is scoped by `user_id`, so a foreign `projectUuid` simply
 * matches nothing. The RAG total is not: ragService.getStorageStats() is keyed
 * on the project alone, so the project has to be proven to belong to `userId`
 * before it is passed on, or naming someone else's project returns their RAG
 * figures.
 */
export async function getProjectStorageUsageFor(
  userId: string,
  projectUuid?: string
): Promise<ProjectStorageUsage> {
  try {
    if (projectUuid) {
      const project = await db.query.projectsTable.findFirst({
        where: and(eq(projectsTable.uuid, projectUuid), eq(projectsTable.user_id, userId)),
        columns: { uuid: true },
      });

      if (!project) {
        return emptyUsage('Project not found');
      }
    }

    const condition = projectUuid
      ? and(eq(docsTable.project_uuid, projectUuid), eq(docsTable.user_id, userId))
      : eq(docsTable.user_id, userId);

    const result = await db
      .select({ totalSize: sum(docsTable.file_size) })
      .from(docsTable)
      .where(condition);

    const fileStorage = Number(result[0]?.totalSize) || 0;

    let ragStorage = 0;
    let ragStorageAvailable = false;
    const warnings: string[] = [];

    if (process.env.ENABLE_RAG === 'true' && projectUuid) {
      try {
        const ragStats = await ragService.getStorageStats(projectUuid);

        if (ragStats.success && ragStats.estimatedStorageMb) {
          ragStorage = Math.round(ragStats.estimatedStorageMb * 1024 * 1024);
          ragStorageAvailable = true;
        } else {
          warnings.push('RAG storage statistics unavailable');
        }
      } catch (error) {
        console.warn('Failed to fetch RAG storage stats:', error);
        warnings.push('Unable to retrieve RAG storage data');
        // Continue with file storage only if RAG stats fail
      }
    }

    return {
      success: true,
      fileStorage,
      ragStorage,
      totalUsage: fileStorage + ragStorage,
      limit: WORKSPACE_STORAGE_LIMIT,
      ragStorageAvailable,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    console.error('Error calculating project storage usage:', error);
    return emptyUsage(
      error instanceof Error ? error.message : 'Failed to calculate storage usage'
    );
  }
}
