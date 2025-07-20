'use server';

import { and, desc, eq, sum } from 'drizzle-orm';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';

import { db } from '@/db';
import { docsTable } from '@/db/schema';
import { extractTextContent } from '@/lib/file-utils';
import { ragService } from '@/lib/rag-service';
import type { 
  Doc, 
  DocDeleteResponse, 
  DocListResponse, 
  DocUploadResponse
} from '@/types/library';

// Create uploads directory if it doesn't exist
// Use environment variable or fallback to /home/pluggedin/uploads (outside project directory)
const UPLOADS_BASE_DIR = process.env.UPLOADS_DIR || '/home/pluggedin/uploads';

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
  // Create user-specific uploads directory
  const userDir = join(UPLOADS_BASE_DIR, userId);
  await mkdir(userDir, { recursive: true });

  // Generate unique filename
  const timestamp = Date.now();
  const fileName = `${timestamp}-${file.name}`;
  const filePath = join(userDir, fileName);
  // Store only the user-relative path for later secure access
  const relativePath = `${userId}/${fileName}`;

  // Save file to disk
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  await writeFile(filePath, buffer);

  return { fileName, relativePath };
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
    
    const result = await ragService.uploadDocument({
      id: docRecord.uuid,
      title: name,
      content: textContent,
              metadata: {
          filename: file.name,
          mimeType: file.type,
          fileSize: file.size,
          tags,
          userId,
        },
    }, file, ragIdentifier);
    
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
      const textContent = await extractTextContent(file, description);
      
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



 