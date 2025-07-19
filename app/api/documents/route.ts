import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { authenticateApiKey } from '@/app/api/auth';
import { db } from '@/db';
import { docsTable, documentModelAttributionsTable } from '@/db/schema';

// Query parameters schema
const listDocumentsSchema = z.object({
  source: z.enum(['all', 'upload', 'ai_generated', 'api']).optional().default('all'),
  modelName: z.string().optional(),
  modelProvider: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  tags: z.array(z.string()).or(z.string()).optional(),
  category: z.string().optional(),
  visibility: z.enum(['all', 'private', 'workspace', 'public']).optional().default('all'),
  searchQuery: z.string().optional(),
  sort: z.enum(['date_desc', 'date_asc', 'title', 'size']).optional().default('date_desc'),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

/**
 * @swagger
 * /api/documents:
 *   get:
 *     summary: List documents with filters
 *     description: Get a paginated list of documents with various filtering options
 *     tags:
 *       - Documents
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *           enum: [all, upload, ai_generated, api]
 *           default: all
 *       - in: query
 *         name: modelName
 *         schema:
 *           type: string
 *         description: Filter by AI model name
 *       - in: query
 *         name: modelProvider
 *         schema:
 *           type: string
 *         description: Filter by AI model provider
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: tags
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         style: form
 *         explode: true
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: visibility
 *         schema:
 *           type: string
 *           enum: [all, private, workspace, public]
 *           default: all
 *       - in: query
 *         name: searchQuery
 *         schema:
 *           type: string
 *         description: Search in title and description
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [date_desc, date_asc, title, size]
 *           default: date_desc
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *     responses:
 *       200:
 *         description: Successfully retrieved documents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 documents:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate request
    const apiKeyResult = await authenticateApiKey(request);
    if (apiKeyResult.error) {
      return apiKeyResult.error;
    }

    const { user, activeProfile } = apiKeyResult;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const params = {
      source: searchParams.get('source') || 'all',
      modelName: searchParams.get('modelName') || undefined,
      modelProvider: searchParams.get('modelProvider') || undefined,
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
      tags: searchParams.getAll('tags').length > 0 ? searchParams.getAll('tags') : 
            searchParams.get('tags')?.split(',').filter(Boolean) || undefined,
      category: searchParams.get('category') || undefined,
      visibility: searchParams.get('visibility') || 'all',
      searchQuery: searchParams.get('searchQuery') || undefined,
      sort: searchParams.get('sort') || 'date_desc',
      limit: parseInt(searchParams.get('limit') || '20', 10),
      offset: parseInt(searchParams.get('offset') || '0', 10),
    };

    const validatedParams = listDocumentsSchema.parse(params);

    // Build query conditions
    const conditions = [];

    // Always filter by profile
    conditions.push(eq(docsTable.profile_uuid, activeProfile.uuid));

    // Source filter
    if (validatedParams.source !== 'all') {
      conditions.push(eq(docsTable.source, validatedParams.source));
    }

    // Date range filter
    if (validatedParams.dateFrom) {
      conditions.push(gte(docsTable.created_at, new Date(validatedParams.dateFrom)));
    }
    if (validatedParams.dateTo) {
      conditions.push(lte(docsTable.created_at, new Date(validatedParams.dateTo)));
    }

    // Visibility filter
    if (validatedParams.visibility !== 'all') {
      conditions.push(eq(docsTable.visibility, validatedParams.visibility));
    }

    // Search query filter
    if (validatedParams.searchQuery) {
      const searchPattern = `%${validatedParams.searchQuery}%`;
      conditions.push(
        sql`(${docsTable.name} ILIKE ${searchPattern} OR ${docsTable.description} ILIKE ${searchPattern})`
      );
    }

    // Tags filter
    if (validatedParams.tags && Array.isArray(validatedParams.tags) && validatedParams.tags.length > 0) {
      conditions.push(
        sql`${docsTable.tags} && ARRAY[${sql.join(validatedParams.tags.map(tag => sql`${tag}`), sql`, `)}]::text[]`
      );
    }

    // Apply model filters if specified
    if (validatedParams.modelName || validatedParams.modelProvider) {
      const modelConditions = [];
      if (validatedParams.modelName) {
        modelConditions.push(
          sql`${docsTable.ai_metadata}->'model'->>'name' = ${validatedParams.modelName}`
        );
      }
      if (validatedParams.modelProvider) {
        modelConditions.push(
          sql`${docsTable.ai_metadata}->'model'->>'provider' = ${validatedParams.modelProvider}`
        );
      }
      // Add model filters to main conditions instead of using having
      conditions.push(and(...modelConditions));
    }

    // Apply sorting  
    let orderByClause;
    switch (validatedParams.sort) {
      case 'date_asc':
        orderByClause = asc(docsTable.created_at);
        break;
      case 'title':
        orderByClause = asc(docsTable.name);
        break;
      case 'size':
        orderByClause = desc(docsTable.file_size);
        break;
      case 'date_desc':
      default:
        orderByClause = desc(docsTable.created_at);
        break;
    }

    // Execute query with all conditions, ordering, and pagination
    const documents = await db
      .select({
        document: docsTable,
        modelAttributions: sql<any>`
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'model_name', ${documentModelAttributionsTable.model_name},
                'model_provider', ${documentModelAttributionsTable.model_provider},
                'contribution_type', ${documentModelAttributionsTable.contribution_type},
                'timestamp', ${documentModelAttributionsTable.contribution_timestamp}
              )
            ) FILTER (WHERE ${documentModelAttributionsTable.id} IS NOT NULL),
            '[]'::json
          )
        `,
      })
      .from(docsTable)
      .leftJoin(
        documentModelAttributionsTable,
        eq(docsTable.uuid, documentModelAttributionsTable.document_id)
      )
      .where(and(...conditions))
      .groupBy(docsTable.uuid)
      .orderBy(orderByClause)
      .limit(validatedParams.limit)
      .offset(validatedParams.offset);

    // Get total count for pagination
    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(docsTable)
      .where(and(...conditions));

    const [{ count }] = await countQuery;

    // Format response
    const formattedDocuments = documents.map(({ document, modelAttributions }) => ({
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
      createdAt: document.created_at,
      updatedAt: document.updated_at,
      aiMetadata: document.ai_metadata,
      modelAttributions: modelAttributions || [],
    }));

    return NextResponse.json({
      documents: formattedDocuments,
      total: Number(count),
      limit: validatedParams.limit,
      offset: validatedParams.offset,
    });
  } catch (error) {
    console.error('Error listing documents:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to list documents' },
      { status: 500 }
    );
  }
}