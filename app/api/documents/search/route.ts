import { and, desc,eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { authenticateApiKey } from '@/app/api/auth';
import { db } from '@/db';
import { docsTable, documentModelAttributionsTable } from '@/db/schema';

// Search query schema
const searchDocumentsSchema = z.object({
  query: z.string().min(1).max(500),
  filters: z.object({
    modelName: z.string().optional(),
    modelProvider: z.string().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    tags: z.array(z.string()).optional(),
    source: z.enum(['all', 'upload', 'ai_generated', 'api']).optional().default('all'),
  }).optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

/**
 * @swagger
 * /api/documents/search:
 *   post:
 *     summary: Search documents semantically
 *     description: Perform semantic search across documents with optional filters
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
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 500
 *               filters:
 *                 type: object
 *                 properties:
 *                   modelName:
 *                     type: string
 *                   modelProvider:
 *                     type: string
 *                   dateFrom:
 *                     type: string
 *                     format: date-time
 *                   dateTo:
 *                     type: string
 *                     format: date-time
 *                   tags:
 *                     type: array
 *                     items:
 *                       type: string
 *                   source:
 *                     type: string
 *                     enum: [all, upload, ai_generated, api]
 *                     default: all
 *               limit:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 50
 *                 default: 10
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
 *                       snippet:
 *                         type: string
 *                       relevanceScore:
 *                         type: number
 *                       source:
 *                         type: string
 *                       aiMetadata:
 *                         type: object
 *                       tags:
 *                         type: array
 *                         items:
 *                           type: string
 *                 total:
 *                   type: integer
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate request
    const apiKeyResult = await authenticateApiKey(request);
    if (apiKeyResult.error) {
      return apiKeyResult.error;
    }

    const { activeProfile } = apiKeyResult;

    // Parse and validate request body
    const body = await request.json();
    const validatedData = searchDocumentsSchema.parse(body);

    // Build search conditions
    const conditions = [
      eq(docsTable.profile_uuid, activeProfile.uuid),
      sql`${docsTable.profile_uuid} IS NOT NULL`, // Explicitly exclude null profiles
    ];

    // Apply filters
    if (validatedData.filters) {
      if (validatedData.filters.source && validatedData.filters.source !== 'all') {
        conditions.push(eq(docsTable.source, validatedData.filters.source));
      }

      if (validatedData.filters.dateFrom) {
        conditions.push(sql`${docsTable.created_at} >= ${new Date(validatedData.filters.dateFrom)}`);
      }

      if (validatedData.filters.dateTo) {
        conditions.push(sql`${docsTable.created_at} <= ${new Date(validatedData.filters.dateTo)}`);
      }

      if (validatedData.filters.tags && validatedData.filters.tags.length > 0) {
        conditions.push(
          sql`${docsTable.tags} && ARRAY[${sql.join(
            validatedData.filters.tags.map(tag => sql`${tag}`),
            sql`, `
          )}]::text[]`
        );
      }

      // Apply model filters if specified
      if (validatedData.filters.modelName) {
        conditions.push(
          sql`${docsTable.ai_metadata}->>'model'->>'name' = ${validatedData.filters.modelName}`
        );
      }
      if (validatedData.filters.modelProvider) {
        conditions.push(
          sql`${docsTable.ai_metadata}->>'model'->>'provider' = ${validatedData.filters.modelProvider}`
        );
      }
    }

    // Build the search query
    // Using PostgreSQL full-text search with relevance scoring
    const searchQuery = db
      .select({
        document: docsTable,
        modelAttributions: sql<any>`
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'model_name', ${documentModelAttributionsTable.model_name},
                'model_provider', ${documentModelAttributionsTable.model_provider},
                'contribution_type', ${documentModelAttributionsTable.contribution_type}
              )
            ) FILTER (WHERE ${documentModelAttributionsTable.id} IS NOT NULL),
            '[]'::json
          )
        `,
        relevanceScore: sql<number>`
          ts_rank(
            to_tsvector('english', ${docsTable.name} || ' ' || COALESCE(${docsTable.description}, '')),
            plainto_tsquery('english', ${validatedData.query})
          ) +
          CASE 
            WHEN ${docsTable.name} ILIKE ${'%' + validatedData.query + '%'} THEN 0.5
            ELSE 0
          END
        `,
      })
      .from(docsTable)
      .leftJoin(
        documentModelAttributionsTable,
        eq(docsTable.uuid, documentModelAttributionsTable.document_id)
      )
      .where(
        and(
          ...conditions,
          sql`(
            to_tsvector('english', ${docsTable.name} || ' ' || COALESCE(${docsTable.description}, ''))
            @@ plainto_tsquery('english', ${validatedData.query})
            OR ${docsTable.name} ILIKE ${'%' + validatedData.query + '%'}
            OR ${docsTable.description} ILIKE ${'%' + validatedData.query + '%'}
          )`
        )
      )
      .groupBy(docsTable.uuid)
      .orderBy(desc(sql<number>`
          ts_rank(
            to_tsvector('english', ${docsTable.name} || ' ' || COALESCE(${docsTable.description}, '')),
            plainto_tsquery('english', ${validatedData.query})
          ) +
          CASE 
            WHEN ${docsTable.name} ILIKE ${'%' + validatedData.query + '%'} THEN 0.5
            ELSE 0
          END
        `))
      .limit(validatedData.limit);

    // Execute search
    console.log('[Document Search] Profile UUID:', activeProfile.uuid);
    console.log('[Document Search] Query:', validatedData.query);
    console.log('[Document Search] Filters:', validatedData.filters);
    
    const results = await searchQuery;
    
    console.log('[Document Search] Results found:', results.length);
    if (results.length > 0) {
      console.log('[Document Search] First few results:', results.slice(0, 3).map(r => ({
        id: r.document.uuid,
        title: r.document.name,
        profile_uuid: r.document.profile_uuid,
        created_at: r.document.created_at
      })));
    }

    // Format results with snippets
    const formattedResults = results.map(({ document, modelAttributions, relevanceScore }) => {
      // Generate snippet
      const content = document.description || document.name;
      const queryLower = validatedData.query.toLowerCase();
      const contentLower = content.toLowerCase();
      const index = contentLower.indexOf(queryLower);
      
      let snippet = content;
      if (index !== -1) {
        const start = Math.max(0, index - 50);
        const end = Math.min(content.length, index + validatedData.query.length + 50);
        snippet = (start > 0 ? '...' : '') + 
                 content.substring(start, end) + 
                 (end < content.length ? '...' : '');
      } else {
        snippet = content.substring(0, 150) + (content.length > 150 ? '...' : '');
      }

      return {
        id: document.uuid,
        title: document.name,
        description: document.description,
        snippet,
        relevanceScore,
        source: document.source,
        aiMetadata: document.ai_metadata,
        tags: document.tags,
        visibility: document.visibility,
        createdAt: document.created_at,
        modelAttributions: modelAttributions || [],
      };
    });

    return NextResponse.json({
      results: formattedResults,
      total: formattedResults.length,
    });
  } catch (error) {
    console.error('Error searching documents:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to search documents' },
      { status: 500 }
    );
  }
}