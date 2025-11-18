import { NextResponse } from 'next/server';

import { getServerActivityMetrics } from '@/lib/trending-service';
import { McpServerSource } from '@/db/schema';
import { registryVPClient } from '@/lib/registry/pluggedin-registry-vp-client';
import { transformPluggedinRegistryToMcpIndex } from '@/lib/registry/registry-transformer';

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

    // Fetch servers from registry (sort by rating to get quality servers)
    const response = await registryVPClient.getAllServersWithStats(
      McpServerSource.REGISTRY,
      { sort: 'rating_desc' },
      100 // Fetch more to have options after filtering
    );

    // Enrich each server with local activity metrics
    const enrichedServers: PopularServerResponse[] = await Promise.all(
      response.servers.map(async (server) => {
        // Get local activity metrics for this server
        const activityMetrics = await getServerActivityMetrics(
          server.id,
          McpServerSource.REGISTRY,
          '30d' // Last 30 days
        );

        // Transform to MCP index format
        const mcpIndex = transformPluggedinRegistryToMcpIndex(server);

        return {
          id: server.id,
          name: server.name,
          description: server.description || '',
          installation_count: activityMetrics.install_count,
          tool_call_count: activityMetrics.tool_call_count,
          rating: server.rating || 0,
          ratingCount: server.rating_count || 0,
          github_stars: mcpIndex.github_stars || undefined,
          githubUrl: mcpIndex.githubUrl || server.repository?.url || undefined,
        };
      })
    );

    // Sort by install count (descending), then by tool calls
    const sortedServers = enrichedServers
      .filter(server => server.installation_count > 0 || server.tool_call_count > 0) // Only show servers with activity
      .sort((a, b) => {
        // Primary sort: install count
        if (b.installation_count !== a.installation_count) {
          return b.installation_count - a.installation_count;
        }
        // Secondary sort: tool call count
        return b.tool_call_count - a.tool_call_count;
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
