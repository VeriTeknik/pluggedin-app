'use server';

import { and, desc, eq, isNull, sum } from 'drizzle-orm';
import { realpathSync } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import * as path from 'path';
import { join, resolve } from 'path';

import { db } from '@/db';
import { docsTable, documentVersionsTable } from '@/db/schema';
import { ragService } from '@/lib/rag-service';
import { sanitizeToPlainText } from '@/lib/sanitization';
import type { 
  Doc, 
  DocDeleteResponse, 
  DocListResponse, 
  DocUploadResponse
} from '@/types/library';

// Create uploads directory if it doesn't exist
// Use environment variable or fallback to platform-specific paths
const getDefaultUploadsDir = () => {
  if (process.platform === 'darwin') {
    // macOS: Use project's uploads directory for local development
    return join(process.cwd(), 'uploads');
  } else if (process.platform === 'win32') {
    // Windows: Use temp directory
    return join(process.env.TEMP || 'C:\\temp', 'pluggedin-uploads');
  } else {
    // Linux: Use /home/pluggedin/uploads
    return '/home/pluggedin/uploads';
  }
};

const UPLOADS_BASE_DIR = process.env.UPLOADS_DIR || getDefaultUploadsDir();

/**
 * Sanitize path components to prevent path injection attacks
 * Removes dangerous characters and prevents directory traversal
 */
function sanitizePath(pathComponent: string): string {
  if (!pathComponent || typeof pathComponent !== 'string') {
    throw new Error('Invalid path component');
  }

  // Remove null bytes and other dangerous characters
  let sanitized = pathComponent.replace(/[\x00-\x1f\x80-\x9f]/g, '');
  
  // Remove or replace path traversal sequences
  sanitized = sanitized.replace(/\.\./g, '');
  sanitized = sanitized.replace(/[\/\\]/g, '_');
  
  // Remove leading/trailing dots and spaces
  sanitized = sanitized.replace(/^[\.\s]+|[\.\s]+$/g, '');
  
  // Ensure it's not empty after sanitization
  if (!sanitized) {
    throw new Error('Path component becomes empty after sanitization');
  }
  
  // Limit length to prevent buffer overflow
  if (sanitized.length > 255) {
    sanitized = sanitized.substring(0, 255);
  }
  
  return sanitized;
}

/**
 * Check if child path is contained within parent path
 * Handles path separators and prevents directory traversal
 */
function isSubPath(parent: string, child: string): boolean {
  const rel = child.slice(parent.length);
  return (
    child === parent ||
    (child.startsWith(parent + path.sep) && !rel.includes('..'))
  );
}

/**
 * Safely create a file path within the uploads directory
 * Validates that the final path is within the allowed directory using real paths
 */
function createSafeFilePath(userId: string, fileName: string): { userDir: string; filePath: string; relativePath: string } {
  const sanitizedUserId = sanitizePath(userId);
  const sanitizedFileName = sanitizePath(fileName);
  
  // Create paths
  const userDir = join(UPLOADS_BASE_DIR, sanitizedUserId);
  const filePath = join(userDir, sanitizedFileName);
  const relativePath = `${sanitizedUserId}/${sanitizedFileName}`;
  
  // Resolve real paths to handle symlinks and prevent bypasses
  let resolvedUploadsDir: string;
  let resolvedUserDir: string;
  let resolvedFilePath: string;
  
  try {
    resolvedUploadsDir = realpathSync(UPLOADS_BASE_DIR);
    // For userDir and filePath, they may not exist yet, so we resolve the parent and join
    resolvedUserDir = resolve(userDir);
    resolvedFilePath = resolve(filePath);
  } catch (err) {
    throw new Error('Invalid path: unable to resolve real path');
  }
  
  // Validate that paths are within the uploads directory (prevent directory traversal)
  if (!isSubPath(resolvedUploadsDir, resolvedUserDir)) {
    throw new Error('Invalid user directory path');
  }
  
  if (!isSubPath(resolvedUserDir, resolvedFilePath)) {
    throw new Error('Invalid file path');
  }
  
  return { userDir, filePath, relativePath };
}

// Workspace storage limit: 100 MB
const WORKSPACE_STORAGE_LIMIT = 100 * 1024 * 1024; // 100 MB in bytes

export async function getDocs(userId: string, projectUuid?: string): Promise<DocListResponse> {
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

export async function getDocByUuid(userId: string, docUuid: string, projectUuid?: string): Promise<Doc | null> {
  try {
    console.log('[getDocByUuid] Input:', { userId, docUuid, projectUuid });
    
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

    console.log('[getDocByUuid] Query result:', doc ? 'Document found' : 'Document not found');
    console.log('[getDocByUuid] Document details:', doc ? { 
      uuid: doc.uuid, 
      user_id: doc.user_id,
      project_uuid: doc.project_uuid,
      profile_uuid: doc.profile_uuid 
    } : null);

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

// Helper function: Get document versions
export async function getDocumentVersions(userId: string, documentId: string, projectUuid?: string) {
  try {
    // First verify the user has access to this document
    const doc = await getDocByUuid(userId, documentId, projectUuid);

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

// Helper function: Calculate project storage usage
export async function getProjectStorageUsage(
  userId: string,
  projectUuid?: string
): Promise<{ success: boolean; usage: number; limit: number; error?: string }> {
  try {
    // Calculate total file size for the project
    const result = await db
      .select({ totalSize: sum(docsTable.file_size) })
      .from(docsTable)
      .where(
        projectUuid 
          ? eq(docsTable.project_uuid, projectUuid)
          : eq(docsTable.user_id, userId)
      );

    const usage = Number(result[0]?.totalSize) || 0;

    return {
      success: true,
      usage,
      limit: WORKSPACE_STORAGE_LIMIT,
    };
  } catch (error) {
    console.error('Error calculating project storage usage:', error);
    return {
      success: false,
      usage: 0,
      limit: WORKSPACE_STORAGE_LIMIT,
      error: error instanceof Error ? error.message : 'Failed to calculate storage usage',
    };
  }
}

// Helper function: Parse and validate form data
async function parseAndValidateFormData(formData: FormData) {
  const fileEntry = formData.get('file');
  const name = formData.get('name') as string;
  const description = formData.get('description') as string || null;
  const tagsString = formData.get('tags') as string;
  
  // Validate file entry is actually a File object
  if (!fileEntry || typeof fileEntry === 'string') {
    throw new Error('Valid file is required');
  }
  
  // Additional validation to ensure it's a proper File/Blob with required properties
  if (!('size' in fileEntry) || !('type' in fileEntry) || !('name' in fileEntry)) {
    throw new Error('Invalid file object');
  }
  
  const file = fileEntry as File;
  
  if (!name) {
    throw new Error('File name is required');
  }

  // Validate file size (max 100MB per file)
  const maxFileSize = 100 * 1024 * 1024; // 100MB
  if (file.size > maxFileSize) {
    throw new Error('File size must be less than 100MB');
  }

  // Parse tags
  const tags = tagsString 
    ? tagsString.split(',').map(tag => tag.trim()).filter(Boolean)
    : [];

  return { file, name, description, tags };
}

// Helper function: Save file to disk in user-specific directory (outside public)
async function saveFileToDisk(file: File, userId: string) {
  // Generate unique filename with timestamp
  const timestamp = Date.now();
  const fileName = `${timestamp}-${file.name}`;

  // Create safe file paths with validation
  const { userDir, filePath, relativePath } = createSafeFilePath(userId, fileName);
  
  // Create user-specific uploads directory
  await mkdir(userDir, { recursive: true });

  // Save file to disk
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  await writeFile(filePath, buffer);

  return { fileName: sanitizePath(fileName), relativePath };
}

// Helper function: Insert document record into database
async function insertDocRecord(
  userId: string,
  projectUuid: string | undefined,
  name: string,
  description: string | null,
  file: File,
  relativePath: string,
  tags: string[]
) {
  const [docRecord] = await db
    .insert(docsTable)
    .values({
      user_id: userId,
      project_uuid: projectUuid,
      name,
      description,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      file_path: relativePath,
      tags,
    })
    .returning();
  
  return docRecord;
}

// Helper function: Validate project storage limit
async function validateProjectStorageLimit(
  userId: string,
  projectUuid: string | undefined,
  newFileSize: number
): Promise<void> {
  const storageResult = await getProjectStorageUsage(userId, projectUuid);
  
  if (!storageResult.success) {
    throw new Error(storageResult.error || 'Failed to check workspace storage');
  }

  const newTotalSize = storageResult.usage + newFileSize;
  
  if (newTotalSize > WORKSPACE_STORAGE_LIMIT) {
    const usedMB = Math.round(storageResult.usage / (1024 * 1024) * 100) / 100;
    const limitMB = Math.round(WORKSPACE_STORAGE_LIMIT / (1024 * 1024));
    const fileMB = Math.round(newFileSize / (1024 * 1024) * 100) / 100;
    
    throw new Error(
      `Workspace storage limit exceeded. Current usage: ${usedMB} MB, ` +
      `File size: ${fileMB} MB, Limit: ${limitMB} MB. ` +
      `Please delete some documents to free up space.`
    );
  }
}

// Helper function: Process RAG upload - now returns upload_id for tracking
async function processRagUpload(
  docRecord: any,
  textContent: string,
  file: File,
  name: string,
  tags: string[],
  userId: string,
  projectUuid?: string
) {
  try {
    // Use projectUuid for project-specific RAG, fallback to userId for legacy
    const ragIdentifier = projectUuid || userId;
    
    const result = await ragService.uploadDocument(file, ragIdentifier);
    
    if (result.success) {
      return { ragProcessed: true, ragError: undefined, upload_id: result.upload_id };
    } else {
      throw new Error(result.error || 'RAG upload failed');
    }
  } catch (ragErr) {
    console.error('Failed to send document to RAG API:', ragErr);
    const ragError = ragErr instanceof Error ? ragErr.message : 'RAG processing failed';
    // Continue with success even if RAG fails
    return { ragProcessed: false, ragError, upload_id: undefined };
  }
}

// Function to update document with RAG document ID after upload completion
export async function updateDocRagId(
  docUuid: string,
  ragDocumentId: string,
  userId: string
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

// Function to get upload status from RAG API
export async function getUploadStatus(
  uploadId: string,
  ragIdentifier: string
): Promise<{ success: boolean; status?: any; error?: string }> {
  try {
    const { ragService } = await import('@/lib/rag-service');
    const result = await ragService.getUploadStatus(uploadId, ragIdentifier);
    
    return {
      success: true,
      status: result
    };
  } catch (error) {
    console.error('Failed to get upload status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function createDoc(
  userId: string,
  projectUuid: string | undefined,
  formData: FormData
): Promise<DocUploadResponse> {
  try {
    // Step 1: Parse and validate form data
    const { file, name, description, tags } = await parseAndValidateFormData(formData);

    // Step 2: Validate project storage limit
    await validateProjectStorageLimit(userId, projectUuid, file.size);

    // Step 3: Save file to disk in user-specific directory
    const { relativePath } = await saveFileToDisk(file, userId);
    
    // Step 4: Insert document record into database
    const docRecord = await insertDocRecord(userId, projectUuid, name, description, file, relativePath, tags);
    
    // Step 5 & 6: Process RAG upload only for supported file types
    let ragProcessed = false;
    let ragError: string | undefined;
    let upload_id: string | undefined;
    
    // Only send PDF, text, and markdown files to RAG
    const supportedRagTypes = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'text/x-markdown',
    ];
    
    if (process.env.ENABLE_RAG === 'true' && supportedRagTypes.includes(file.type)) {
      // Extract text content for RAG
      // For now, we'll use a simple approach for text files
      // PDF extraction would require additional libraries like pdf-parse
      let textContent = '';
      
      if (file.type === 'text/plain' || file.type === 'text/markdown' || file.type === 'text/x-markdown') {
        // For text files, convert to string
        const arrayBuffer = await file.arrayBuffer();
        textContent = new TextDecoder().decode(arrayBuffer);
      } else if (file.type === 'application/pdf') {
        // For PDFs, we'd need a library like pdf-parse
        // For now, just use the description as placeholder
        textContent = description || 'PDF content extraction not implemented';
      }
      
      // Process RAG upload
      const ragResult = await processRagUpload(
        docRecord, textContent, file, name, tags, userId, projectUuid
      );
      ragProcessed = ragResult.ragProcessed;
      ragError = ragResult.ragError;
      upload_id = ragResult.upload_id;
    } else if (process.env.ENABLE_RAG === 'true') {
      // File type not supported for RAG
      console.log(`File type ${file.type} not supported for RAG processing`);
    }

    // Step 7: Return response with formatted doc
    const doc: Doc = {
      ...docRecord,
      source: docRecord.source as 'upload' | 'ai_generated' | 'api',
      visibility: docRecord.visibility as 'private' | 'workspace' | 'public',
      created_at: new Date(docRecord.created_at),
      updated_at: new Date(docRecord.updated_at),
    };

    return {
      success: true,
      doc,
      upload_id, // Include upload_id for progress tracking
      ragProcessed,
      ragError,
    };
  } catch (error) {
    console.error('Error creating doc:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload document',
    };
  }
}

export async function deleteDoc(
  userId: string,
  docUuid: string,
  projectUuid?: string
): Promise<DocDeleteResponse> {
  try {
    // Get the doc first to get file path and verify ownership
    const doc = await getDocByUuid(userId, docUuid, projectUuid);
    if (!doc) {
      return {
        success: false,
        error: 'Document not found',
      };
    }

    // Delete from database
    await db
      .delete(docsTable)
      .where(
        and(
          eq(docsTable.uuid, docUuid),
          eq(docsTable.user_id, userId)
        )
      );

    // Delete file from disk (using same base directory as uploads)
    try {
      const fullPath = join(UPLOADS_BASE_DIR, doc.file_path);
      await unlink(fullPath);
    } catch (fileError) {
      console.warn('Failed to delete file from disk:', fileError);
      // Don't fail the operation if file deletion fails
    }

    // Remove from RAG API using the stored rag_document_id (if it exists)
    if (doc.rag_document_id) {
      const ragIdentifier = projectUuid || userId;
      
      ragService.removeDocument(doc.rag_document_id, ragIdentifier).catch(error => {
        console.error('Failed to remove document from RAG API:', error);
      });
    }

    return {
      success: true,
    };
  } catch (error) {
    console.error('Error deleting doc:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete document',
    };
  }
}

export async function getRagDocuments(ragIdentifier: string): Promise<{ success: boolean; documents?: Array<[string, string]>; error?: string }> {
  return ragService.getDocuments(ragIdentifier);
}

export async function queryRag(ragIdentifier: string, query: string): Promise<{ success: boolean; response?: string; error?: string }> {
  return ragService.queryForResponse(ragIdentifier, query);
}

export async function askKnowledgeBase(userId: string, query: string, projectUuid?: string): Promise<{
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
  'use server';

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
                    updateDocRagId(doc.uuid, ragId, userId).catch(err =>
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

/**
 * Manual repair function with detailed feedback for fixing document-RAG ID mismatches
 */
export async function manualRepairDocumentRagIds(
  userId: string,
  projectUuid?: string
): Promise<{
  success: boolean;
  details?: {
    totalDocuments: number;
    orphanedDocuments: number;
    repairedDocuments: number;
    failedDocuments: number;
    repairedList?: string[];
    failedList?: string[];
  };
  error?: string;
}> {
  'use server';

  try {
    // Get the project UUID or use user ID as identifier
    const ragIdentifier = projectUuid || userId;

    // Get all documents for the user
    const allDocs = await db
      .select({
        uuid: docsTable.uuid,
        name: docsTable.name,
        file_name: docsTable.file_name,
        rag_document_id: docsTable.rag_document_id,
        created_at: docsTable.created_at
      })
      .from(docsTable)
      .where(
        and(
          eq(docsTable.user_id, userId),
          projectUuid ? eq(docsTable.project_uuid, projectUuid) : undefined
        )
      )
      .orderBy(desc(docsTable.created_at));

    const orphanedDocs = allDocs.filter(doc => !doc.rag_document_id);

    // Get all RAG documents
    let ragDocuments: Array<[string, string]> = [];
    try {
      const ragDocsResult = await ragService.getDocuments(ragIdentifier);
      if (ragDocsResult.success && ragDocsResult.documents) {
        ragDocuments = ragDocsResult.documents;
      }
    } catch (error) {
      console.error('Error fetching RAG documents:', error);
    }

    const repairedList: string[] = [];
    const failedList: string[] = [];

    // Process each orphaned document
    for (const doc of orphanedDocs) {
      try {
        // Use the enhanced matching function
        const ragDocId = findMatchingRagDocument(doc, ragDocuments);

        if (ragDocId) {
          console.log(`Found matching RAG document for ${doc.name}: ${ragDocId}`);
          const updateResult = await updateDocRagId(doc.uuid, ragDocId, userId);
          if (updateResult.success) {
            repairedList.push(doc.name);
          } else {
            failedList.push(doc.name);
          }
        } else {
          // Try fetching fresh list
          try {
            const freshResult = await ragService.getDocuments(ragIdentifier);
            if (freshResult.success && freshResult.documents) {
              const freshRagDocId = findMatchingRagDocument(doc, freshResult.documents);
              if (freshRagDocId) {
                console.log(`Found matching RAG document on retry for ${doc.name}: ${freshRagDocId}`);
                const updateResult = await updateDocRagId(doc.uuid, freshRagDocId, userId);
                if (updateResult.success) {
                  repairedList.push(doc.name);
                } else {
                  failedList.push(doc.name);
                }
              } else {
                failedList.push(doc.name);
              }
            } else {
              failedList.push(doc.name);
            }
          } catch (retryError) {
            console.error(`Error on retry for document ${doc.name}:`, retryError);
            failedList.push(doc.name);
          }
        }
      } catch (error) {
        console.error(`Error processing document ${doc.name}:`, error);
        failedList.push(doc.name);
      }
    }

    return {
      success: true,
      details: {
        totalDocuments: allDocs.length,
        orphanedDocuments: orphanedDocs.length,
        repairedDocuments: repairedList.length,
        failedDocuments: failedList.length,
        repairedList,
        failedList
      }
    };
  } catch (error) {
    console.error('Error in manual repair:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to repair documents'
    };
  }
}

/**
 * Helper function to process items in batches with concurrency control
 */
async function processInBatches<T, R>(
  items: T[],
  processFn: (item: T) => Promise<R>,
  batchSize: number,
  maxConcurrency: number
): Promise<R[]> {
  const results: R[] = [];
  const total = items.length;

  // Process items in chunks with limited concurrency
  for (let i = 0; i < total; i += batchSize) {
    const batch = items.slice(i, Math.min(i + batchSize, total));

    // Process batch with limited concurrency
    for (let j = 0; j < batch.length; j += maxConcurrency) {
      const concurrentItems = batch.slice(j, Math.min(j + maxConcurrency, batch.length));
      const concurrentPromises = concurrentItems.map(item => processFn(item));
      const concurrentResults = await Promise.allSettled(concurrentPromises);

      // Collect successful results
      for (const result of concurrentResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        }
      }

      // Add delay between concurrent batches to avoid rate limiting
      if (j + maxConcurrency < batch.length) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
      }
    }

    // Add delay between batches to avoid overwhelming the service
    if (i + batchSize < total) {
      await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between batches
    }
  }

  return results;
}

/**
 * Helper function to match documents with RAG entries using various patterns
 */
function findMatchingRagDocument(
  doc: { file_name: string; name: string },
  ragDocuments: Array<[string, string]>
): string | null {
  // Try various matching strategies
  for (const [filename, ragId] of ragDocuments) {
    // 1. Exact file_name match
    if (doc.file_name === filename) {
      return ragId;
    }

    // 2. Exact name match
    if (doc.name === filename) {
      return ragId;
    }

    // 3. Match after removing timestamp prefix (e.g., "1234567890-filename.ext" -> "filename.ext")
    if (doc.file_name && doc.file_name.includes('-')) {
      const withoutTimestamp = doc.file_name.substring(doc.file_name.indexOf('-') + 1);
      if (withoutTimestamp === filename) {
        return ragId;
      }
    }

    // 4. Match by removing version suffixes (e.g., "document_v2_timestamp.md" -> "document.md")
    const docBaseName = doc.file_name
      ?.replace(/_v\d+_[\d-TZ]+/, '') // Remove version pattern
      ?.replace(/\d{4}-\d{2}-\d{2}_/, '') // Remove date prefix
      ?.replace(/^\d+-/, ''); // Remove timestamp prefix

    const ragBaseName = filename
      ?.replace(/_v\d+_[\d-TZ]+/, '')
      ?.replace(/\d{4}-\d{2}-\d{2}_/, '')
      ?.replace(/^\d+-/, '');

    if (docBaseName && ragBaseName && docBaseName === ragBaseName) {
      return ragId;
    }

    // 5. Fuzzy match for AI-generated documents with complex naming
    // e.g., "2025-09-18_18-19-00-872Z_claude-opus-4-1_AI_Integration_Best_Practices_Guide.md"
    const normalizedDocName = doc.file_name
      ?.replace(/[-_]/g, '')
      ?.toLowerCase();
    const normalizedRagName = filename
      ?.replace(/[-_]/g, '')
      ?.toLowerCase();

    if (normalizedDocName && normalizedRagName) {
      // Check if one contains the other (for partial matches)
      if (normalizedDocName.includes(normalizedRagName) ||
          normalizedRagName.includes(normalizedDocName)) {
        return ragId;
      }

      // Check for AI-generated pattern match
      if (doc.file_name?.includes('claude') && filename.includes('claude')) {
        // Extract the meaningful part after model name
        const docPart = doc.file_name.split(/claude[^_]*_/)[1];
        const ragPart = filename.split(/claude[^_]*_/)[1];
        if (docPart && ragPart && docPart === ragPart) {
          return ragId;
        }
      }
    }
  }

  return null;
}

/**
 * Repair function to fix AI-generated documents without rag_document_id
 * This can be run as a one-time migration or periodic cleanup task
 * Implements batching and rate limiting to avoid service overload
 */
export async function repairMissingRagDocumentIds(
  userId: string,
  projectUuid?: string,
  batchSize: number = 10,
  maxConcurrency: number = 3
): Promise<{ success: boolean; repaired: number; failed: number; error?: string }> {
  'use server';

  try {
    // Find AI-generated documents without rag_document_id
    const orphanedDocs = await db
      .select({
        uuid: docsTable.uuid,
        name: docsTable.name,
        file_path: docsTable.file_path,
        file_name: docsTable.file_name,
        mime_type: docsTable.mime_type,
        source: docsTable.source
      })
      .from(docsTable)
      .where(
        and(
          eq(docsTable.user_id, userId),
          eq(docsTable.source, 'ai_generated'),
          isNull(docsTable.rag_document_id),
          projectUuid ? eq(docsTable.project_uuid, projectUuid) : undefined
        )
      );

    console.log(`Found ${orphanedDocs.length} AI documents without RAG IDs to repair`);

    if (orphanedDocs.length === 0) {
      return {
        success: true,
        repaired: 0,
        failed: 0
      };
    }

    const ragIdentifier = projectUuid || userId;

    // Fetch RAG documents once to avoid repeated API calls
    let ragDocuments: [string, string][] = [];
    try {
      const documentsResult = await ragService.getDocuments(ragIdentifier);
      if (documentsResult.success && documentsResult.documents) {
        ragDocuments = documentsResult.documents;
      }
    } catch (error) {
      console.error('Error fetching RAG documents:', error);
      // Continue with empty list - individual repairs might still work
    }

    // Process documents in batches with rate limiting
    const processDocument = async (doc: typeof orphanedDocs[0]): Promise<boolean> => {
      try {
        // Use the enhanced matching function to find the RAG document
        const ragDocId = findMatchingRagDocument(doc, ragDocuments);

        if (ragDocId) {
          console.log(`Found matching RAG document for ${doc.name}: ${ragDocId}`);

          // Update the document with the found RAG ID
          const updateResult = await updateDocRagId(doc.uuid, ragDocId, userId);
          return updateResult.success;
        } else {
          // If not found in pre-fetched list, try individual lookup
          // This is a fallback for recently added documents
          try {
            const freshResult = await ragService.getDocuments(ragIdentifier);
            if (freshResult.success && freshResult.documents) {
              // Use enhanced matching on fresh results
              const freshRagDocId = findMatchingRagDocument(doc, freshResult.documents);
              if (freshRagDocId) {
                console.log(`Found matching RAG document on retry for ${doc.name}: ${freshRagDocId}`);
                const updateResult = await updateDocRagId(doc.uuid, freshRagDocId, userId);
                return updateResult.success;
              }
            }
          } catch (retryError) {
            console.error(`Error on retry for document ${doc.name}:`, retryError);
          }

          console.log(`No matching RAG document found for ${doc.name}, may need re-upload`);
          return false;
        }
      } catch (error) {
        console.error(`Error repairing document ${doc.uuid}:`, error);
        return false;
      }
    };

    // Process documents with batching and rate limiting
    const results = await processInBatches(
      orphanedDocs,
      processDocument,
      batchSize,
      maxConcurrency
    );

    const repairedCount = results.filter(Boolean).length;
    const failedCount = results.filter(r => !r).length;

    console.log(`Repair complete: ${repairedCount} fixed, ${failedCount} failed`);

    return {
      success: true,
      repaired: repairedCount,
      failed: failedCount
    };
  } catch (error) {
    console.error('Error repairing RAG document IDs:', error);
    return {
      success: false,
      repaired: 0,
      failed: 0,
      error: error instanceof Error ? error.message : 'Failed to repair documents'
    };
  }
}
