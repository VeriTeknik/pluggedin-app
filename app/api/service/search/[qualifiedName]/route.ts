import { NextRequest, NextResponse } from 'next/server';

import { getServerRatingMetrics } from '@/app/actions/mcp-server-metrics';
import { McpIndex } from '@/types/search';

/**
 * Enrich a server with rating and installation metrics
 */
async function enrichServerWithMetrics(server: McpIndex): Promise<McpIndex> {
  if (!server.source || !server.external_id) {
    return server;
  }
  
  try {
    // Get metrics for this server
    const metricsResult = await getServerRatingMetrics({
      source: server.source,
      externalId: server.external_id
    });
    
    if (metricsResult.success && metricsResult.metrics) {
      // Add metrics to server data
      server.rating = metricsResult.metrics.averageRating;
      server.ratingCount = metricsResult.metrics.ratingCount;
      server.installation_count = metricsResult.metrics.installationCount;
    }
  } catch (error) {
    console.error(`Failed to get metrics for ${server.name}:`, error);
    // Continue even if metrics fail
  }
  
  return server;
}

/**
 * Get detailed information about a specific MCP server
 * Legacy endpoint - deprecated sources are no longer supported
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ qualifiedName: string }> }
) {
  const { qualifiedName } = await params;
  
  return NextResponse.json(
    { 
      error: 'This endpoint no longer supports legacy sources (GitHub, Smithery, NPM). Please use the registry API for server discovery.',
      qualifiedName 
    },
    { status: 410 } // Gone
  );
}

 