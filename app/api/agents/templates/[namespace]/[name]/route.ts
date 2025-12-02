import { and, eq, desc, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { agentTemplatesTable, agentsTable } from '@/db/schema';

/**
 * @swagger
 * /api/agents/templates/{namespace}/{name}:
 *   get:
 *     summary: Get agent template details
 *     description: |
 *       Returns detailed information about a specific agent template.
 *       Includes full description, environment schema, and version history.
 *       No authentication required for public templates.
 *     tags:
 *       - Agent Marketplace
 *     parameters:
 *       - name: namespace
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Template namespace (e.g., 'veriteknik')
 *       - name: name
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Template name (e.g., 'compass')
 *       - name: version
 *         in: query
 *         schema:
 *           type: string
 *         description: Specific version (defaults to latest)
 *     responses:
 *       200:
 *         description: Template details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 template:
 *                   type: object
 *                   properties:
 *                     uuid:
 *                       type: string
 *                       format: uuid
 *                     namespace:
 *                       type: string
 *                     name:
 *                       type: string
 *                     version:
 *                       type: string
 *                     display_name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     long_description:
 *                       type: string
 *                     icon_url:
 *                       type: string
 *                     banner_url:
 *                       type: string
 *                     docker_image:
 *                       type: string
 *                     container_port:
 *                       type: integer
 *                     health_endpoint:
 *                       type: string
 *                     env_schema:
 *                       type: object
 *                     category:
 *                       type: string
 *                     tags:
 *                       type: array
 *                       items:
 *                         type: string
 *                     is_verified:
 *                       type: boolean
 *                     is_featured:
 *                       type: boolean
 *                     install_count:
 *                       type: integer
 *                     repository_url:
 *                       type: string
 *                     documentation_url:
 *                       type: string
 *                 versions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       version:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *       404:
 *         description: Template not found
 *       500:
 *         description: Internal Server Error
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ namespace: string; name: string }> }
) {
  try {
    const { namespace, name } = await params;
    const { searchParams } = new URL(request.url);
    const version = searchParams.get('version');

    // Build query conditions
    const conditions = [
      eq(agentTemplatesTable.namespace, namespace),
      eq(agentTemplatesTable.name, name),
      eq(agentTemplatesTable.is_public, true),
    ];

    if (version) {
      conditions.push(eq(agentTemplatesTable.version, version));
    }

    // Get template (latest version if not specified)
    const templates = await db
      .select()
      .from(agentTemplatesTable)
      .where(and(...conditions))
      .orderBy(desc(agentTemplatesTable.created_at))
      .limit(1);

    if (templates.length === 0) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    const template = templates[0];

    // Get all versions of this template
    const versions = await db
      .select({
        version: agentTemplatesTable.version,
        created_at: agentTemplatesTable.created_at,
      })
      .from(agentTemplatesTable)
      .where(
        and(
          eq(agentTemplatesTable.namespace, namespace),
          eq(agentTemplatesTable.name, name),
          eq(agentTemplatesTable.is_public, true)
        )
      )
      .orderBy(desc(agentTemplatesTable.created_at));

    // Get deployment count for this template
    const deploymentCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentsTable)
      .where(eq(agentsTable.template_uuid, template.uuid));

    return NextResponse.json({
      template: {
        ...template,
        deployment_count: deploymentCount[0]?.count || 0,
      },
      versions,
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    return NextResponse.json(
      { error: 'Failed to fetch template' },
      { status: 500 }
    );
  }
}
