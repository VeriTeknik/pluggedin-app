import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { McpServerSource,mcpServersTable } from '@/db/schema';
import { registryVPClient } from '@/lib/registry/pluggedin-registry-vp-client';
import { calculateTrendingServers } from '@/lib/trending-service';

export const dynamic = 'force-dynamic';
export const revalidate = 900; // Cache for 15 minutes

interface PopularServerResponse {
  id: string;
  name: string;
  description: string;
  installation_count: number;
  tool_call_count: number;
  rating: number;
  ratingCount: number;
  github_stars?: number;
  githubUrl?: string;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') || '6')));

    // Use the same approach as trending servers - query local activity directly
    // Get trending servers from the last 30 days to find popular servers
    const trendingServers = await calculateTrendingServers(
      null, // All sources
      '30d', // 30 day period
      50 // Fetch more to have options after filtering
    );

    // Enrich trending servers with metadata from registry
    const enrichedServers = await Promise.all(
      trendingServers.map(async (server) => {
        let metadata: PopularServerResponse = {
          id: server.server_id,
          name: server.server_id, // Fallback name
          description: '',
          installation_count: server.install_count,
          tool_call_count: server.tool_call_count,
          rating: 0,
          ratingCount: 0,
        };

        try {
          if (server.source === McpServerSource.REGISTRY) {
            // For registry servers, try to get from local database first
            const mcpServer = await db.query.mcpServersTable.findFirst({
              where: eq(mcpServersTable.external_id, server.server_id)
            });

            if (mcpServer) {
              // Use local server data
              metadata = {
                ...metadata,
                name: mcpServer.name,
                description: mcpServer.description || '',
                githubUrl: mcpServer.repository_url || undefined,
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
                    ...metadata,
                    name: displayName,
                    description: registryServer.description || '',
                    githubUrl: registryServer.repository?.url,
                    rating: registryServer.rating || 0,
                    ratingCount: registryServer.rating_count || 0,
                  };
                }
              } catch (registryError) {
                console.error(`Failed to fetch registry metadata for ${server.server_id}:`, registryError);
              }
            }
          }
        } catch (error) {
          console.error(`Failed to fetch metadata for ${server.server_id}:`, error);
        }

        return metadata;
      })
    );

    // Sort by activity first (installs, then tool calls)
    const sortedServers = enrichedServers
      .sort((a, b) => {
        // Primary sort: install count
        if (b.installation_count !== a.installation_count) {
          return b.installation_count - a.installation_count;
        }
        // Secondary sort: tool call count
        if (b.tool_call_count !== a.tool_call_count) {
          return b.tool_call_count - a.tool_call_count;
        }
        // Tertiary sort: rating (for servers with no activity)
        return b.rating - a.rating;
      })
      .slice(0, limit);

    return NextResponse.json(
      { servers: sortedServers },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching popular servers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch popular servers', servers: [] },
      { status: 500 }
    );
  }
}
