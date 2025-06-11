'use server';

import { and, desc,eq } from 'drizzle-orm';
import { mkdir, unlink,writeFile } from 'fs/promises';
import { join } from 'path';

import { db } from '@/db';
import { docsTable } from '@/db/schema';
import type { Doc, DocDeleteResponse, DocListResponse, DocUploadResponse, RAGDocumentRequest } from '@/types/docs';

// Create uploads directory if it doesn't exist
const UPLOADS_DIR = join(process.cwd(), 'public', 'uploads', 'docs');

export async function getDocs(userId: string): Promise<DocListResponse> {
  try {
    const docs = await db.query.docsTable.findMany({
      where: eq(docsTable.user_id, userId),
      orderBy: [desc(docsTable.created_at)],
    });

    return {
      success: true,
      docs: docs.map(doc => ({
        ...doc,
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

export async function getDocByUuid(userId: string, docUuid: string): Promise<Doc | null> {
  try {
    const doc = await db.query.docsTable.findFirst({
      where: and(
        eq(docsTable.uuid, docUuid),
        eq(docsTable.user_id, userId)
      ),
    });

    if (!doc) {
      return null;
    }

    return {
      ...doc,
      created_at: new Date(doc.created_at),
      updated_at: new Date(doc.updated_at),
    };
  } catch (error) {
    console.error('Error fetching doc:', error);
    return null;
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

  // Validate file size (max 10MB)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    throw new Error('File size must be less than 10MB');
  }

  // Parse tags
  const tags = tagsString 
    ? tagsString.split(',').map(tag => tag.trim()).filter(Boolean)
    : [];

  return { file, name, description, tags };
}

// Helper function: Save file to disk
async function saveFileToDisk(file: File) {
  // Create uploads directory
  await mkdir(UPLOADS_DIR, { recursive: true });

  // Generate unique filename
  const timestamp = Date.now();
  const fileName = `${timestamp}-${file.name}`;
  const filePath = join(UPLOADS_DIR, fileName);
  const relativePath = `/uploads/docs/${fileName}`;

  // Save file to disk
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  await writeFile(filePath, buffer);

  return { fileName, relativePath };
}

// Helper function: Insert document record into database
async function insertDocRecord(
  userId: string,
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

// Helper function: Extract text content for RAG
async function extractTextContent(file: File, description: string | null): Promise<string> {
  try {
    if (file.type.includes('text') || file.type.includes('markdown')) {
      return await file.text();
    } else if (file.type.includes('pdf')) {
      // For PDF, you might want to use a PDF parsing library
      // For now, we'll just use the filename and description
      return `PDF Document: ${file.name}\nDescription: ${description || 'No description'}`;
    } else {
      return `Document: ${file.name}\nType: ${file.type}\nDescription: ${description || 'No description'}`;
    }
  } catch (parseError) {
    console.warn('Failed to parse file content for RAG:', parseError);
    return `Document: ${file.name}\nDescription: ${description || 'No description'}`;
  }
}

// Helper function: Process RAG upload
async function processRagUpload(
  docRecord: any,
  textContent: string,
  file: File,
  name: string,
  tags: string[],
  userId: string
) {
  try {
    await sendToRAGAPI({
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
    }, file);
    console.log('Document successfully uploaded to RAG API');
    return { ragProcessed: true, ragError: undefined };
  } catch (ragErr) {
    console.error('Failed to send document to RAG API:', ragErr);
    const ragError = ragErr instanceof Error ? ragErr.message : 'RAG processing failed';
    // Continue with success even if RAG fails
    return { ragProcessed: false, ragError };
  }
}

export async function createDoc(
  userId: string,
  formData: FormData
): Promise<DocUploadResponse> {
  try {
    // Step 1: Parse and validate form data
    const { file, name, description, tags } = await parseAndValidateFormData(formData);
    
    // Step 2: Save file to disk
    const { fileName, relativePath } = await saveFileToDisk(file);
    
    // Step 3: Insert document record into database
    const docRecord = await insertDocRecord(userId, name, description, file, relativePath, tags);
    
    // Step 4: Extract text content for RAG
    const textContent = await extractTextContent(file, description);
    
    // Step 5: Process RAG upload
    const { ragProcessed, ragError } = await processRagUpload(
      docRecord, textContent, file, name, tags, userId
    );

    // Step 6: Return response with formatted doc
    const doc: Doc = {
      ...docRecord,
      created_at: new Date(docRecord.created_at),
      updated_at: new Date(docRecord.updated_at),
    };

    return {
      success: true,
      doc,
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
  docUuid: string
): Promise<DocDeleteResponse> {
  try {
    // Get the doc first to get file path
    const doc = await getDocByUuid(userId, docUuid);
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

    // Delete file from disk
    try {
      const fullPath = join(process.cwd(), 'public', doc.file_path);
      await unlink(fullPath);
    } catch (fileError) {
      console.warn('Failed to delete file from disk:', fileError);
      // Don't fail the operation if file deletion fails
    }

    // Remove from RAG API (don't await to avoid blocking)
    removeFromRAGAPI(docUuid, userId).catch(error => {
      console.error('Failed to remove document from RAG API:', error);
    });

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

// Helper function to send document to RAG API
async function sendToRAGAPI(document: RAGDocumentRequest, file: File): Promise<void> {
  try {
    const ragApiUrl = process.env.RAG_API_URL || 'http://127.0.0.1:8000';
    
    if (!ragApiUrl) {
      console.warn('RAG_API_URL not configured');
      return;
    }

    // Create FormData for multipart upload
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${ragApiUrl}/rag/upload-to-collection?user_id=${document.metadata.userId}`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        // Don't set Content-Type, let browser set it with boundary for multipart
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`RAG API responded with status: ${response.status}`);
    }

    console.log(`Successfully sent document ${document.id} to RAG API`);
  } catch (error) {
    console.error('Error sending to RAG API:', error);
    throw error;
  }
}

// Helper function to remove document from RAG API
async function removeFromRAGAPI(documentId: string, userId: string): Promise<void> {
  try {
    const ragApiUrl = process.env.RAG_API_URL || 'http://127.0.0.1:8000';
    
    if (!ragApiUrl) {
      console.warn('RAG_API_URL not configured');
      return;
    }

    const response = await fetch(`${ragApiUrl}/rag/delete-from-collection?document_id=${documentId}&user_id=${userId}`, {
      method: 'DELETE',
      headers: {
        'accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`RAG API responded with status: ${response.status}`);
    }

    console.log(`Successfully removed document ${documentId} from RAG API`);
  } catch (error) {
    console.error('Error removing from RAG API:', error);
    throw error;
  }
}

export async function getRagDocuments(userId: string): Promise<{ success: boolean; documents?: Array<[string, string]>; error?: string }> {
  try {
    const ragApiUrl = process.env.RAG_API_URL || 'http://127.0.0.1:8000';
    
    if (!ragApiUrl) {
      return {
        success: false,
        error: 'RAG_API_URL not configured',
      };
    }

    const response = await fetch(`${ragApiUrl}/rag/get-collection?user_id=${userId}`, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`RAG API responded with status: ${response.status}`);
    }

    const documents = await response.json();
    
    return {
      success: true,
      documents, // Array of [filename, document_id] pairs
    };
  } catch (error) {
    console.error('Error fetching RAG documents:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch RAG documents',
    };
  }
} 