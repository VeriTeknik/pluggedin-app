import { desc, eq, and, or, ilike, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { agentTemplatesTable } from '@/db/schema';

/**
 * @swagger
 * /api/agents/templates:
 *   get:
 *     summary: List agent templates from the marketplace
 *     description: |
 *       Returns all public agent templates available in the marketplace.
 *       Supports filtering by category, tags, and search query.
 *       No authentication required for public templates.
 *     tags:
 *       - Agent Marketplace
 *     parameters:
 *       - name: category
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter by category (e.g., 'research', 'productivity')
 *       - name: tag
 *         in: query
 *         schema:
 *           type: string
 *         description: Filter by tag (e.g., 'ai', 'consensus')
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *         description: Search in name, display_name, and description
 *       - name: featured
 *         in: query
 *         schema:
 *           type: boolean
 *         description: Only show featured templates
 *       - name: verified
 *         in: query
 *         schema:
 *           type: boolean
 *         description: Only show verified templates
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Maximum number of results
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset for pagination
 *     responses:
 *       200:
 *         description: List of agent templates
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 templates:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       uuid:
 *                         type: string
 *                         format: uuid
 *                       namespace:
 *                         type: string
 *                       name:
 *                         type: string
 *                       version:
 *                         type: string
 *                       display_name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       icon_url:
 *                         type: string
 *                       category:
 *                         type: string
 *                       tags:
 *                         type: array
 *                         items:
 *                           type: string
 *                       is_verified:
 *                         type: boolean
 *                       is_featured:
 *                         type: boolean
 *                       install_count:
 *                         type: integer
 *                 total:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *       500:
 *         description: Internal Server Error
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const category = searchParams.get('category');
    const tag = searchParams.get('tag');
    const search = searchParams.get('search');
    const featured = searchParams.get('featured') === 'true';
    const verified = searchParams.get('verified') === 'true';

    // Parse limit/offset with NaN fallback to safe defaults
    const rawLimit = Number.parseInt(searchParams.get('limit') ?? '20', 10);
    const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 20, 100);

    const rawOffset = Number.parseInt(searchParams.get('offset') ?? '0', 10);
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

    // Build conditions
    const conditions = [eq(agentTemplatesTable.is_public, true)];

    if (category) {
      conditions.push(eq(agentTemplatesTable.category, category));
    }

    if (featured) {
      conditions.push(eq(agentTemplatesTable.is_featured, true));
    }

    if (verified) {
      conditions.push(eq(agentTemplatesTable.is_verified, true));
    }

    if (search) {
      conditions.push(
        or(
          ilike(agentTemplatesTable.name, `%${search}%`),
          ilike(agentTemplatesTable.display_name, `%${search}%`),
          ilike(agentTemplatesTable.description, `%${search}%`)
        )!
      );
    }

    // Tag filtering (check if tag exists in array)
    if (tag) {
      conditions.push(
        sql`${agentTemplatesTable.tags} @> ARRAY[${tag}]::text[]`
      );
    }

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentTemplatesTable)
      .where(and(...conditions));

    const total = countResult[0]?.count || 0;

    // Get templates
    const templates = await db
      .select({
        uuid: agentTemplatesTable.uuid,
        namespace: agentTemplatesTable.namespace,
        name: agentTemplatesTable.name,
        version: agentTemplatesTable.version,
        display_name: agentTemplatesTable.display_name,
        description: agentTemplatesTable.description,
        icon_url: agentTemplatesTable.icon_url,
        banner_url: agentTemplatesTable.banner_url,
        category: agentTemplatesTable.category,
        tags: agentTemplatesTable.tags,
        is_verified: agentTemplatesTable.is_verified,
        is_featured: agentTemplatesTable.is_featured,
        install_count: agentTemplatesTable.install_count,
        repository_url: agentTemplatesTable.repository_url,
        documentation_url: agentTemplatesTable.documentation_url,
        created_at: agentTemplatesTable.created_at,
      })
      .from(agentTemplatesTable)
      .where(and(...conditions))
      .orderBy(
        desc(agentTemplatesTable.is_featured),
        desc(agentTemplatesTable.install_count),
        desc(agentTemplatesTable.created_at)
      )
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      templates,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}
