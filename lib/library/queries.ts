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
import { sanitizeToPlainText } from '@/lib/sanitization';
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

        if (ragStats.success && typeof ragStats.estimatedStorageMb === 'number') {
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

/**
 * The knowledge-base query and the rag-id write, taking the owning user id.
 *
 * askKnowledgeBase(userId, …) as a server action let any caller aim the
 * retrieval at another tenant's documents and read back an answer composed
 * from them; updateDocRagId(…, userId) let any caller rewrite another
 * tenant's rag pointer. Both have non-browser callers that establish identity
 * themselves — the MCP connector from an API key, app/api/documents/ai from
 * its own auth — so the identity stays an explicit parameter here and the
 * session-derived wrappers live in app/actions/library.ts.
 */

export async function updateDocRagIdFor(
  userId: string,
  docUuid: string,
  ragDocumentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await db
      .update(docsTable)
      .set({ 
        rag_document_id: ragDocumentId,
        updated_at: new Date()
      })
      .where(
        and(
          eq(docsTable.uuid, docUuid),
          eq(docsTable.user_id, userId)
        )
      );

    return { success: true };
  } catch (error) {
    console.error('Failed to update document RAG ID:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function askKnowledgeBaseFor(userId: string, query: string, projectUuid?: string): Promise<{
  success: boolean;
  answer?: string;
  sources?: string[];
  documentIds?: string[];
  documents?: Array<{
    id: string;
    name: string;
    relevance?: number;
    model?: {
      name: string;
      provider: string;
    };
    source?: string;
    isUnresolved?: boolean;
  }>;
  error?: string
}> {
  try {
    // For now, we'll use the RAG service directly since the MCP tool
    // is designed for external access. In production, this would integrate
    // with the MCP infrastructure
    const ragIdentifier = projectUuid || userId;
    const result = await ragService.queryForResponse(ragIdentifier, query);

    if (result.success && result.response) {
      // Fetch document names and metadata if we have document IDs
      let documents: Array<{
        id: string;
        name: string;
        relevance?: number;
        model?: {
          name: string;
          provider: string;
        };
        source?: string;
      }> = [];
      if (result.documentIds && result.documentIds.length > 0) {
        try {
          // First, get all user documents
          const docs = await db
            .select({
              uuid: docsTable.uuid,
              name: docsTable.name,
              file_name: docsTable.file_name,
              rag_document_id: docsTable.rag_document_id,
              source: docsTable.source,
              ai_metadata: docsTable.ai_metadata
            })
            .from(docsTable)
            .where(
              and(
                eq(docsTable.user_id, userId),
                projectUuid ? eq(docsTable.project_uuid, projectUuid) : undefined
              )
            );

          // Get RAG document list for filename-based fallback matching
          const ragDocumentMap: Map<string, string> = new Map();
          let ragServicePartiallyAvailable = false;

          try {
            const ragDocsResult = await ragService.getDocuments(ragIdentifier);
            if (ragDocsResult.success && ragDocsResult.documents) {
              // Create a map of RAG document ID to filename
              ragDocsResult.documents.forEach(([filename, docId]) => {
                ragDocumentMap.set(docId, filename);
              });
            } else if (!ragDocsResult.success) {
              // Document listing failed but search may still work
              console.warn('RAG document listing unavailable:', ragDocsResult.error);
              ragServicePartiallyAvailable = true;
            }
          } catch (ragError) {
            // Log error but continue with search
            console.error('Failed to fetch RAG document list for fallback, continuing with search:', ragError);
            ragServicePartiallyAvailable = true;
            // Search results will show with document IDs instead of names
          }

          // Map RAG document IDs to document names with metadata
          const mappedDocs = result.documentIds
            .map((ragId, index) => {
              // First try direct RAG ID match
              let doc = docs.find(d => d.rag_document_id === ragId);

              // If not found, try filename-based matching
              if (!doc && ragDocumentMap.has(ragId)) {
                const ragFilename = ragDocumentMap.get(ragId);
                if (ragFilename) {
                  // Try to match by file_name or by name
                  doc = docs.find(d =>
                    d.file_name === ragFilename ||
                    d.name === ragFilename ||
                    // Also try matching the filename part of file_name (after timestamp-)
                    (d.file_name && d.file_name.includes('-') &&
                     d.file_name.substring(d.file_name.indexOf('-') + 1) === ragFilename)
                  );

                  if (doc) {
                    console.log(`Matched document by filename: ${ragFilename} -> ${doc.name}`);
                    // Update the document's RAG ID for future queries
                    updateDocRagIdFor(userId, doc.uuid, ragId).catch(err =>
                      console.error(`Failed to update RAG ID for ${doc!.uuid}:`, err)
                    );
                  }
                }
              }

              // Calculate relevance score (simulated based on order, in production this would come from RAG)
              // Documents are typically returned in order of relevance
              const relevance = Math.max(100 - (index * 15), 60); // Start at 100%, decrease by 15% per position, min 60%

              if (!doc) {
                // Try to get a better display name from RAG document map
                const ragFilename = ragDocumentMap.get(ragId);
                let displayName: string;

                if (ragFilename) {
                  // Use the filename if available
                  displayName = ragFilename.length > 50
                    ? ragFilename.substring(0, 47) + '...'
                    : ragFilename;
                } else {
                  // Fallback to truncated ID
                  displayName = ragId.length > 20
                    ? `Document ${ragId.substring(0, 8)}...${ragId.substring(ragId.length - 4)}`
                    : `Document ${ragId}`;
                }

                console.warn(`Document not found for RAG ID: ${ragId}${ragFilename ? ` (${ragFilename})` : ''}${ragServicePartiallyAvailable ? ' (RAG service partially unavailable)' : ''}`);

                // Adjust display name if RAG service is partially unavailable
                if (ragServicePartiallyAvailable && !ragFilename) {
                  displayName = `Document (service temporarily limited)`;
                }

                return {
                  id: ragId, // Use RAG ID as fallback
                  name: sanitizeToPlainText(displayName),
                  relevance,
                  source: 'unknown' as const,
                  isUnresolved: true // Mark as unresolved for UI handling
                };
              }

              // Sanitize document name to prevent XSS
              const sanitizedName = sanitizeToPlainText(doc.name);

              return {
                id: doc.uuid,
                name: sanitizedName,
                relevance,
                model: doc.ai_metadata?.model ? {
                  name: sanitizeToPlainText(doc.ai_metadata.model.name || 'Unknown'),
                  provider: sanitizeToPlainText(doc.ai_metadata.model.provider || 'Unknown')
                } : undefined,
                source: doc.source || 'upload',
                isUnresolved: false // Explicitly mark as resolved
              };
            });

          // Include all documents (both matched and unmatched)
          documents = mappedDocs;
        } catch (dbError) {
          console.error('Error fetching document names:', dbError);
          // Continue without document names if DB query fails
        }
      }

      // Track RAG document retrievals
      if (projectUuid && result.documentIds && result.documentIds.length > 0) {
        try {
          // Get the active profile for this project
          const { projectsTable, mcpActivityTable } = await import('@/db/schema');
          const project = await db.query.projectsTable.findFirst({
            where: eq(projectsTable.uuid, projectUuid),
            with: {
              activeProfile: true
            }
          });

          if (project?.activeProfile?.uuid) {
            const profileUuid = project.activeProfile.uuid;
            // Track each document retrieval via RAG with error aggregation
            let failedTracking = 0;
            const trackingPromises = documents.map(async (doc) => {
              try {
                await db.insert(mcpActivityTable).values({
                  profile_uuid: profileUuid,
                  server_uuid: null,
                  external_id: null,
                  source: 'PLUGGEDIN',
                  action: 'document_rag_query',
                  item_name: doc.id,
                });
              } catch (err) {
                failedTracking++;
                console.error(`Failed to track RAG access for ${doc.id}:`, err);
              }
            });
            await Promise.all(trackingPromises);

            // Log aggregate failures for monitoring
            if (failedTracking > 0) {
              console.warn(`Analytics tracking: ${failedTracking}/${documents.length} RAG document access events failed to track`);
            }

            // Invalidate analytics cache for this profile after tracking all documents
            const { analyticsCache } = await import('@/lib/analytics-cache');
            analyticsCache.invalidateProfile(profileUuid);
          }
        } catch (trackingError) {
          console.error('Failed to track RAG document access:', trackingError);
          // Continue even if tracking fails
        }
      }

      return {
        success: true,
        answer: result.response,
        sources: result.sources || [],
        documentIds: result.documentIds || [],
        documents
      };
    }

    return {
      success: false,
      error: result.error || 'Failed to get response from knowledge base'
    };
  } catch (error) {
    console.error('Error querying knowledge base:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
