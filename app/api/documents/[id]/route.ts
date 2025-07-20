import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { readFile, writeFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { join, resolve } from 'path';
import { z } from 'zod';

import { authenticateApiKey } from '@/app/api/auth';
import { db } from '@/db';
import { docsTable, documentModelAttributionsTable,documentVersionsTable } from '@/db/schema';

// Query parameters schema
const getDocumentSchema = z.object({
  includeContent: z.enum(['true', 'false']).optional().default('false'),
  includeVersions: z.enum(['true', 'false']).optional().default('false'),
});

/**
 * @swagger
 * /api/documents/{id}:
 *   get:
 *     summary: Get document by ID
 *     description: Retrieve a specific document with optional content and version history
 *     tags:
 *       - Documents
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document UUID
 *       - in: query
 *         name: includeContent
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *           default: 'false'
 *         description: Include document content
 *       - in: query
 *         name: includeVersions
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *           default: 'false'
 *         description: Include version history
 *     responses:
 *       200:
 *         description: Document retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate request
    const apiKeyResult = await authenticateApiKey(request);
    if (apiKeyResult.error) {
      return apiKeyResult.error;
    }

    const { activeProfile } = apiKeyResult;
    const { id: documentId } = await params;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const queryParams = {
      includeContent: searchParams.get('includeContent') || 'false',
      includeVersions: searchParams.get('includeVersions') || 'false',
    };

    const validatedParams = getDocumentSchema.parse(queryParams);

    console.log('[Document Get] Profile UUID:', activeProfile.uuid);
    console.log('[Document Get] Document ID:', documentId);
    console.log('[Document Get] Query params:', validatedParams);

    // Fetch document with model attributions
    const documentQuery = await db
      .select({
        document: docsTable,
        modelAttributions: documentModelAttributionsTable,
      })
      .from(docsTable)
      .leftJoin(
        documentModelAttributionsTable,
        eq(docsTable.uuid, documentModelAttributionsTable.document_id)
      )
      .where(
        and(
          eq(docsTable.uuid, documentId),
          or(
            eq(docsTable.profile_uuid, activeProfile.uuid),
            and(
              eq(docsTable.project_uuid, activeProfile.project_uuid),
              isNull(docsTable.profile_uuid)
            )
          )
        )
      );

    if (documentQuery.length === 0) {
      console.log('[Document Get] Document not found or not accessible');
      console.log('[Document Get] Checking if document exists in DB...');
      
      // Check if document exists but is in different profile
      const documentExists = await db
        .select({ uuid: docsTable.uuid, profile_uuid: docsTable.profile_uuid })
        .from(docsTable)
        .where(eq(docsTable.uuid, documentId))
        .limit(1);
      
      if (documentExists.length > 0) {
        console.log('[Document Get] Document exists but belongs to different profile:', documentExists[0].profile_uuid);
        return NextResponse.json(
          { error: 'Document not found or not accessible', details: 'Document exists but is not accessible to your profile' },
          { status: 404 }
        );
      } else {
        console.log('[Document Get] Document does not exist in database');
        return NextResponse.json(
          { error: 'Document not found', details: 'Document does not exist' },
          { status: 404 }
        );
      }
    }

    // Group attributions by document
    const document = documentQuery[0].document;
    const modelAttributions = documentQuery
      .filter(row => row.modelAttributions)
      .map(row => ({
        modelName: row.modelAttributions!.model_name,
        modelProvider: row.modelAttributions!.model_provider,
        contributionType: row.modelAttributions!.contribution_type,
        timestamp: row.modelAttributions!.contribution_timestamp,
        metadata: row.modelAttributions!.contribution_metadata,
      }));

    // Prepare response
    const response: any = {
      id: document.uuid,
      title: document.name,
      description: document.description,
      fileName: document.file_name,
      fileSize: document.file_size,
      mimeType: document.mime_type,
      tags: document.tags,
      source: document.source,
      visibility: document.visibility,
      version: document.version,
      parentDocumentId: document.parent_document_id,
      aiMetadata: document.ai_metadata,
      contentHash: document.content_hash,
      createdAt: document.created_at,
      updatedAt: document.updated_at,
      modelAttributions,
    };

    // Include content if requested
    if (validatedParams.includeContent === 'true') {
      try {
        // Resolve the file path - handle both relative and absolute paths
        const uploadsDir = process.env.UPLOADS_DIR || '/home/pluggedin/uploads';
        const filePath = document.file_path.startsWith('/') 
          ? document.file_path 
          : join(uploadsDir, document.file_path);
        
        // Validate the resolved path is within uploads directory
        const resolvedPath = resolve(filePath);
        const resolvedUploadsDir = resolve(uploadsDir);
        
        if (!resolvedPath.startsWith(resolvedUploadsDir)) {
          console.error('Path traversal attempt detected:', document.file_path);
          return NextResponse.json(
            { error: 'Invalid file path' },
            { status: 403 }
          );
        }
        
        const mimeType = document.mime_type || 'text/plain';
        
        // Check if file is binary
        const isBinary = !mimeType.startsWith('text/') && 
                         mimeType !== 'application/json' &&
                         mimeType !== 'application/xml';
        
        if (isBinary) {
          // Read as buffer and encode to base64
          const buffer = await readFile(filePath);
          response.content = buffer.toString('base64');
          response.contentEncoding = 'base64';
        } else {
          // Read as text
          const content = await readFile(filePath, 'utf-8');
          response.content = content;
          response.contentEncoding = 'utf-8';
        }
      } catch (error) {
        console.error('Error reading document content:', error);
        console.error('File path attempted:', document.file_path);
        // Return error status instead of success with error field
        return NextResponse.json(
          { 
            error: 'Failed to read document content', 
            details: error instanceof Error ? error.message : 'Unknown error',
            ...(process.env.NODE_ENV === 'development' && { filePath: document.file_path })
          },
          { status: 500 }
        );
      }
    }

    // Include version history if requested
    if (validatedParams.includeVersions === 'true') {
      const versions = await db
        .select()
        .from(documentVersionsTable)
        .where(eq(documentVersionsTable.document_id, documentId))
        .orderBy(desc(documentVersionsTable.version_number));

      response.versions = versions.map(version => ({
        versionNumber: version.version_number,
        createdAt: version.created_at,
        createdByModel: version.created_by_model,
        changeSummary: version.change_summary,
        contentDiff: version.content_diff,
      }));
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching document:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch document' },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/documents/{id}:
 *   patch:
 *     summary: Update document
 *     description: Update or append to an existing AI-generated document
 *     tags:
 *       - Documents
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - operation
 *               - content
 *             properties:
 *               operation:
 *                 type: string
 *                 enum: [replace, append, prepend]
 *               content:
 *                 type: string
 *                 description: New content
 *               metadata:
 *                 type: object
 *                 properties:
 *                   tags:
 *                     type: array
 *                     items:
 *                       type: string
 *                   changeSummary:
 *                     type: string
 *                   model:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       provider:
 *                         type: string
 *                       version:
 *                         type: string
 *     responses:
 *       200:
 *         description: Document updated successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Document updates are currently disabled as RAG system doesn't support updates
  return NextResponse.json(
    { 
      error: 'Document updates are not supported at this time', 
      details: 'The RAG system does not currently support document updates. Please create a new document instead.' 
    },
    { status: 501 } // Not Implemented
  );
}