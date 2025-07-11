import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { McpServerSource, sharedMcpServersTable, profilesTable, projectsTable, users, mcpServersTable } from '@/db/schema';
import { calculateTrendingServers, TRENDING_PERIODS } from '@/lib/trending-service';
import { registryVPClient } from '@/lib/registry/pluggedin-registry-vp-client';
import type { SearchIndex } from '@/types/search';

// Query params schema
const querySchema = z.object({
  source: z.enum(['REGISTRY', 'COMMUNITY', 'all']).optional().default('all'),
  period: z.enum(['24h', '7d', '30d']).optional().default('7d'),
  limit: z.coerce.number().min(1).max(50).optional().default(10),
});

/**
 * @swagger
 * /api/trending/servers:
 *   get:
 *     summary: Get trending MCP servers
 *     description: Returns trending servers based on recent activity (installs, tool usage)
 *     tags:
 *       - Trending
 *       - Analytics
 *     parameters:
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *           enum: [REGISTRY, COMMUNITY, all]
 *           default: all
 *         description: Filter by server source
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [24h, 7d, 30d]
 *           default: 7d
 *         description: Time period for trending calculation
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: Maximum number of results
 *     responses:
 *       200:
 *         description: List of trending servers with metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 servers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       source:
 *                         type: string
 *                         enum: [REGISTRY, COMMUNITY]
 *                       trending_score:
 *                         type: number
 *                       install_count:
 *                         type: number
 *                       tool_call_count:
 *                         type: number
 *                       total_activity_count:
 *                         type: number
 *                       last_activity:
 *                         type: string
 *                         format: date-time
 *                 period:
 *                   type: object
 *                   properties:
 *                     label:
 *                       type: string
 *                     hours:
 *                       type: number
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const params = querySchema.parse({
      source: searchParams.get('source') || undefined,
      period: searchParams.get('period') || undefined,
      limit: searchParams.get('limit') || undefined,
    });

    console.log('[Trending API] Params:', params);

    // Calculate trending servers
    const sourceFilter = params.source === 'all' ? null : params.source as McpServerSource;
    const trendingServers = await calculateTrendingServers(
      sourceFilter,
      params.period,
      params.limit
    );
    
    console.log('[Trending API] Found trending servers:', trendingServers.length);

    // Enrich trending servers with metadata
    const enrichedServers = await Promise.all(
      trendingServers.map(async (server) => {
        let metadata: Partial<SearchIndex[string]> = {};

        try {
          if (server.source === McpServerSource.REGISTRY) {
            // For registry servers, first try to get from local database
            const mcpServer = await db.query.mcpServersTable.findFirst({
              where: eq(mcpServersTable.external_id, server.server_id)
            });
            
            if (mcpServer) {
              // Use local server name if available
              metadata = {
                name: mcpServer.name,
                description: mcpServer.description || '',
              };
            } else {
              // Fallback to fetching from registry
              try {
                const registryServer = await registryVPClient.getServerWithStats(server.server_id);
                
                if (registryServer) {
                  // Extract display name from qualified name
                  const displayName = registryServer.name?.split('/').pop()?.replace(/-/g, ' ')
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ') || registryServer.name || 'Unknown';
                    
                  metadata = {
                    name: displayName,
                    description: registryServer.description || '',
                    githubUrl: registryServer.repository?.url,
                    package_name: registryServer.packages?.[0]?.name,
                    package_registry: registryServer.packages?.[0]?.registry_name,
                  };
                }
              } catch (registryError) {
                console.error(`Failed to fetch registry metadata for ${server.server_id}:`, registryError);
                // Use fallback metadata
                metadata = {
                  name: server.server_id,
                  description: 'Registry server (metadata unavailable)',
                };
              }
            }
          } else if (server.source === McpServerSource.COMMUNITY) {
            // Fetch community server metadata from database
            const result = await db
              .select({
                sharedServer: sharedMcpServersTable,
                user: users,
              })
              .from(sharedMcpServersTable)
              .innerJoin(profilesTable, eq(sharedMcpServersTable.profile_uuid, profilesTable.uuid))
              .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
              .innerJoin(users, eq(projectsTable.user_id, users.id))
              .where(eq(sharedMcpServersTable.uuid, server.server_id))
              .limit(1);
            
            if (result.length > 0) {
              const { sharedServer, user } = result[0];
              const template = sharedServer.template as Record<string, any>;
              
              metadata = {
                name: sharedServer.title,
                description: sharedServer.description || '',
                category: template?.category,
                tags: template?.tags,
                shared_by: user?.username || 'Unknown User',
                shared_by_profile_url: user?.username ? `/to/${user.username}` : null,
              };
            }
          }
        } catch (error) {
          console.error(`Failed to fetch metadata for ${server.server_id}:`, error);
        }

        return {
          id: server.server_id,
          name: metadata.name || 'Unknown Server',
          description: metadata.description || '',
          source: server.source,
          category: metadata.category,
          tags: metadata.tags,
          trending_score: server.trending_score,
          install_count: server.install_count,
          tool_call_count: server.tool_call_count,
          total_activity_count: server.total_activity_count,
          last_activity: new Date(server.last_activity).toISOString(),
          // Additional metadata
          github_url: metadata.githubUrl,
          package_name: metadata.package_name,
          package_registry: metadata.package_registry,
          shared_by: metadata.shared_by,
          shared_by_profile_url: metadata.shared_by_profile_url,
        };
      })
    );

    return NextResponse.json({
      servers: enrichedServers,
      period: TRENDING_PERIODS[params.period],
    });
  } catch (error) {
    console.error('Error fetching trending servers:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch trending servers', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}