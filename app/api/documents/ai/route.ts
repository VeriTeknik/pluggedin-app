import { randomUUID, createHash } from 'crypto';
import { mkdir,writeFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';
import { isPathWithinDirectory, isValidFilename } from '@/lib/security';

import { authenticateApiKey } from '@/app/api/auth';
import { db } from '@/db';
import { docsTable, documentModelAttributionsTable, notificationsTable } from '@/db/schema';
import { rateLimit, RATE_LIMITS } from '@/lib/api-rate-limit';

// Validation schema for AI document creation
const createAIDocumentSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1).max(10 * 1024 * 1024), // 10MB limit
  format: z.enum(['md', 'txt', 'json', 'html']).default('md'),
  tags: z.array(z.string()).max(20).optional().default([]),
  category: z.enum(['report', 'analysis', 'documentation', 'guide', 'research', 'code', 'other']).optional().default('other'),
  metadata: z.object({
    model: z.object({
      name: z.string(),
      provider: z.string(),
      version: z.string().optional(),
    }),
    context: z.string().optional(),
    visibility: z.enum(['private', 'workspace', 'public']).default('private'),
  }),
});

/**
 * @swagger
 * /api/documents/ai:
 *   post:
 *     summary: Create AI-generated document
 *     description: Allows AI models to create and save documents to the user's library via MCP
 *     tags:
 *       - Documents
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *               - metadata
 *             properties:
 *               title:
 *                 type: string
 *                 description: Document title
 *                 maxLength: 255
 *               content:
 *                 type: string
 *                 description: Document content
 *                 maxLength: 10485760
 *               format:
 *                 type: string
 *                 enum: [md, txt, json, html]
 *                 default: md
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 maxItems: 20
 *               category:
 *                 type: string
 *                 enum: [report, analysis, documentation, guide, research, code, other]
 *                 default: other
 *               metadata:
 *                 type: object
 *                 required:
 *                   - model
 *                 properties:
 *                   model:
 *                     type: object
 *                     required:
 *                       - name
 *                       - provider
 *                     properties:
 *                       name:
 *                         type: string
 *                       provider:
 *                         type: string
 *                       version:
 *                         type: string
 *                   context:
 *                     type: string
 *                   visibility:
 *                     type: string
 *                     enum: [private, workspace, public]
 *                     default: private
 *     responses:
 *       201:
 *         description: Document created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 documentId:
 *                   type: string
 *                 message:
 *                   type: string
 *                 url:
 *                   type: string
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimiter = rateLimit(RATE_LIMITS.aiDocumentCreation);
    const rateLimitResponse = await rateLimiter(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Check Content-Length header to prevent large payloads early
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Request body too large. Maximum size is 10MB' },
        { status: 413 }
      );
    }

    // Authenticate request
    const apiKeyResult = await authenticateApiKey(request);
    if (apiKeyResult.error) {
      return apiKeyResult.error;
    }

    const { user, activeProfile } = apiKeyResult;

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createAIDocumentSchema.parse(body);

    // Sanitize content if HTML or markdown
    let processedContent = validatedData.content;
    if (validatedData.format === 'html' || validatedData.format === 'md') {
      processedContent = sanitizeHtml(validatedData.content, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'code']),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          img: ['src', 'alt', 'title', 'width', 'height'],
          code: ['class'],
        },
        allowedClasses: {
          code: ['language-*'],
        },
      });
    }

    // Generate unique identifiers
    const documentId = randomUUID();
    const timestamp = new Date();

    // Create safe filename
    const safeModelName = validatedData.metadata.model.name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const safeTitle = validatedData.title.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
    const filename = `${timestamp.toISOString().split('T')[0]}_${safeModelName}_${safeTitle}.${validatedData.format}`;

    // Validate filename is safe
    if (!isValidFilename(filename)) {
      return NextResponse.json(
        { error: 'Invalid filename' },
        { status: 400 }
      );
    }

    // Determine upload directory path with user ID
    const baseUploadDir = process.env.UPLOADS_DIR || '/home/pluggedin/uploads';
    const userUploadDir = join(baseUploadDir, user.id);
    
    // Ensure the user upload directory is within the base upload directory
    if (!isPathWithinDirectory(userUploadDir, baseUploadDir)) {
      console.error('Path traversal attempt detected:', userUploadDir);
      return NextResponse.json(
        { error: 'Invalid upload path' },
        { status: 400 }
      );
    }
    
    await mkdir(userUploadDir, { recursive: true });

    const filePath = join(userUploadDir, filename);
    const relativePath = `${user.id}/${filename}`;
    
    // Double-check the final file path is within allowed directory
    if (!isPathWithinDirectory(filePath, userUploadDir)) {
      console.error('Path traversal attempt detected in file path:', filePath);
      return NextResponse.json(
        { error: 'Invalid file path' },
        { status: 400 }
      );
    }

    // Write content to file
    await writeFile(filePath, processedContent, 'utf-8');

    // Calculate file size
    const fileSize = Buffer.byteLength(processedContent, 'utf-8');

    // Generate content hash for deduplication using Node.js crypto
    const contentHash = createHash('sha256').update(processedContent, 'utf-8').digest('hex');

    // Determine MIME type
    const mimeTypeMap: Record<string, string> = {
      md: 'text/markdown',
      txt: 'text/plain',
      json: 'application/json',
      html: 'text/html',
    };
    const mimeType = mimeTypeMap[validatedData.format] || 'text/plain';

    // Begin transaction
    const result = await db.transaction(async (tx) => {
      // Insert document record
      const [document] = await tx.insert(docsTable).values({
        uuid: documentId,
        user_id: user.id,
        project_uuid: activeProfile.project_uuid,
        profile_uuid: activeProfile.uuid,
        name: validatedData.title,
        description: `AI-generated ${validatedData.category || 'document'} by ${validatedData.metadata.model.name}`,
        file_name: filename,
        file_size: fileSize,
        mime_type: mimeType,
        file_path: relativePath,
        tags: validatedData.tags,
        source: 'ai_generated',
        ai_metadata: {
          model: validatedData.metadata.model,
          context: validatedData.metadata.context,
          timestamp: timestamp.toISOString(),
          sessionId: request.headers.get('x-session-id') || undefined,
        },
        content_hash: contentHash,
        visibility: validatedData.metadata.visibility,
        version: 1,
      }).returning();

      // Create model attribution record
      await tx.insert(documentModelAttributionsTable).values({
        document_id: documentId,
        model_name: validatedData.metadata.model.name,
        model_provider: validatedData.metadata.model.provider,
        contribution_type: 'created',
        contribution_metadata: {
          version: validatedData.metadata.model.version,
          category: validatedData.category,
          tags: validatedData.tags,
        },
      });

      // Create notification
      await tx.insert(notificationsTable).values({
        id: randomUUID(),
        profile_uuid: activeProfile.uuid,
        type: 'document_created_ai',
        title: 'AI Document Created',
        message: `${validatedData.metadata.model.name} created "${validatedData.title}"`,
        severity: 'INFO',
        link: `/library/${documentId}`,
        created_at: timestamp,
      });

      return document;
    });

    // Trigger RAG processing only for specific file formats
    if (process.env.ENABLE_RAG === 'true' && ['md', 'txt', 'pdf'].includes(validatedData.format)) {
      // Extract text content based on format
      const textContent = validatedData.format === 'md' || validatedData.format === 'txt' 
        ? processedContent 
        : ''; // PDF would need special extraction
      
      if (textContent) {
        // Import RAG service dynamically to avoid circular dependencies
        const { ragService } = await import('@/lib/rag-service');
        
        // Send to RAG service asynchronously (fire and forget)
        // Create a dummy file object for AI-generated content
        const dummyFile = new File([textContent], filename, { type: mimeType });
        
        ragService.uploadDocument({
          id: documentId,
          title: validatedData.title,
          content: textContent,
          metadata: {
            filename: filename,
            mimeType,
            fileSize,
            tags: validatedData.tags,
            userId: apiKeyResult.user.id,
          },
        }, dummyFile, apiKeyResult.activeProfile.project_uuid || apiKeyResult.user.id).catch(async error => {
          console.error('Failed to send AI document to RAG:', error);
          
          // Create a notification about the RAG failure
          try {
            await db.insert(notificationsTable).values({
              id: randomUUID(),
              profile_uuid: activeProfile.uuid,
              type: 'document_rag_failed',
              title: 'RAG Processing Failed',
              message: `Failed to process "${validatedData.title}" for search capabilities. The document was saved but may not be searchable.`,
              severity: 'WARNING',
              link: `/library/${documentId}`,
              created_at: new Date(),
            });
          } catch (notificationError) {
            console.error('Failed to create RAG failure notification:', notificationError);
          }
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        documentId,
        message: 'Document successfully created',
        url: `/library/${documentId}`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating AI document:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid request data', 
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message
          }))
        },
        { status: 400 }
      );
    }

    // Don't expose internal error details
    return NextResponse.json(
      { error: 'Failed to create document' },
      { status: 500 }
    );
  }
}