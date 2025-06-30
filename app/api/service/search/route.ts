import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { registryService } from '@/lib/services/registry.service';
import { getServerRatingMetrics } from '@/app/actions/mcp-server-metrics';
import { db } from '@/db';
import { McpServerSource, profilesTable, projectsTable, sharedMcpServersTable, users } from '@/db/schema';
import type { PaginatedSearchResult, SearchIndex, McpIndex } from '@/types/search';

/**
 * Search for MCP servers using the pluggedin-registry
 * 
 * @param request NextRequest object
 * @returns NextResponse with search results
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const query = url.searchParams.get('query') || '';
  const source = (url.searchParams.get('source') as McpServerSource) || null;
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '10');

  try {
    // If source is 'all' or not specified, search registry
    if (!source || source === 'all') {
      // Search the registry
      const registryResult = await registryService.search({
        query,
        limit: pageSize,
        offset,
      });

      // Convert registry results to our SearchIndex format
      const results: SearchIndex = {};
      
      registryResult.results.forEach((server) => {
        const key = `registry:${server.id}`;
        
        // Map registry server to McpIndex format
        results[key] = {
          name: server.name,
          description: server.description,
          command: '', // Will be filled from server details
          args: [],
          envs: [],
          url: null,
          source: server.source as McpServerSource || McpServerSource.GITHUB,
          external_id: server.id,
          githubUrl: server.repository || null,
          package_name: null,
          github_stars: server.metadata?.github_stars || null,
          package_registry: null,
          package_download_count: null,
          category: server.metadata?.category,
          tags: server.metadata?.tags,
          qualifiedName: key,
          updated_at: server.updated_at || server.created_at,
          // Additional fields from registry
          rating: server.metadata?.rating || 0,
          ratingCount: 0, // Registry doesn't provide this yet
          installation_count: server.metadata?.install_count || 0,
          shared_by: null,
          shared_by_profile_url: null,
        };
      });

      // Return paginated results
      const paginatedResult: PaginatedSearchResult = {
        results,
        total: registryResult.total,
        offset,
        pageSize,
        hasMore: offset + pageSize < registryResult.total,
      };

      return NextResponse.json(paginatedResult);
    }

    // If a specific source is requested, still search registry but filter by source
    if (source === McpServerSource.COMMUNITY) {
      // For community source, fetch from the pluggedin-app database
      const communityResults = await searchCommunity(query);
      
      // Paginate results
      const keys = Object.keys(communityResults);
      const totalResults = keys.length;
      const paginatedKeys = keys.slice(offset, offset + pageSize);
      const paginatedResults: SearchIndex = {};
      
      for (const key of paginatedKeys) {
        paginatedResults[key] = communityResults[key];
      }
      
      return NextResponse.json({
        results: paginatedResults,
        total: totalResults,
        offset,
        pageSize,
        hasMore: offset + pageSize < totalResults,
      } as PaginatedSearchResult);
    }

    // For other sources (GITHUB, NPM, SMITHERY), search registry with source filter
    const registryResult = await registryService.search({
      query,
      limit: pageSize,
      offset,
      // Note: The registry API doesn't support source filtering yet
      // This will need to be implemented in the registry
    });

    // Filter results by source on the client side for now
    const filteredServers = registryResult.results.filter(
      server => server.source === source
    );

    // Convert to SearchIndex format
    const results: SearchIndex = {};
    
    filteredServers.forEach((server) => {
      const key = `${source.toLowerCase()}:${server.id}`;
      
      results[key] = {
        name: server.name,
        description: server.description,
        command: '',
        args: [],
        envs: [],
        url: null,
        source: source,
        external_id: server.id,
        githubUrl: server.repository || null,
        package_name: null,
        github_stars: server.metadata?.github_stars || null,
        package_registry: null,
        package_download_count: null,
        category: server.metadata?.category,
        tags: server.metadata?.tags,
        qualifiedName: key,
        updated_at: server.updated_at || server.created_at,
        rating: server.metadata?.rating || 0,
        ratingCount: 0,
        installation_count: server.metadata?.install_count || 0,
        shared_by: null,
        shared_by_profile_url: null,
      };
    });

    // Return paginated results
    const paginatedResult: PaginatedSearchResult = {
      results,
      total: filteredServers.length,
      offset,
      pageSize,
      hasMore: false, // Since we're filtering client-side, we can't determine if there are more
    };

    return NextResponse.json(paginatedResult);

  } catch (error) {
    console.error('Search error:', error);
    // Return community results only if registry is unavailable
    if (!source || source === 'all') {
      try {
        const communityResults = await searchCommunity(query);
        
        // Paginate results
        const keys = Object.keys(communityResults);
        const totalResults = keys.length;
        const paginatedKeys = keys.slice(offset, offset + pageSize);
        const paginatedResults: SearchIndex = {};
        
        for (const key of paginatedKeys) {
          paginatedResults[key] = communityResults[key];
        }
        
        return NextResponse.json({
          results: paginatedResults,
          total: totalResults,
          offset,
          pageSize,
          hasMore: offset + pageSize < totalResults,
        } as PaginatedSearchResult);
      } catch (communityError) {
        console.error('Community search also failed:', communityError);
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to search for MCP servers' },
      { status: 500 }
    );
  }
}

/**
 * Search for community MCP servers - implementation to show shared servers
 * 
 * @param query Search query
 * @returns SearchIndex of results
 */
async function searchCommunity(query: string): Promise<SearchIndex> {
  try {
    // Get shared MCP servers, joining through profiles and projects to get user info
    const sharedServersQuery = db
      .select({
        sharedServer: sharedMcpServersTable,
        profile: profilesTable,
        user: users, // Select user data
      })
      .from(sharedMcpServersTable)
      .innerJoin(profilesTable, eq(sharedMcpServersTable.profile_uuid, profilesTable.uuid))
      .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid)) // Join to projects
      .innerJoin(users, eq(projectsTable.user_id, users.id)) // Join to users
      .where(
        query
          ? and(
              eq(sharedMcpServersTable.is_public, true),
              or(
                ilike(sharedMcpServersTable.title, `%${query}%`),
                ilike(sharedMcpServersTable.description || '', `%${query}%`),
                ilike(users.username, `%${query}%`), // Search by username from users table
                ilike(users.email, `%${query}%`) // Also search by user email
              )
            )
          : eq(sharedMcpServersTable.is_public, true)
      )
      .orderBy(desc(sharedMcpServersTable.created_at))
      .limit(50); // Limit to 50 results

    const resultsWithJoins = await sharedServersQuery;

    // Convert to our SearchIndex format
    const results: SearchIndex = {};

    for (const { sharedServer, profile, user } of resultsWithJoins) {
      // We'll use the template field which contains the sanitized MCP server data
      const template = sharedServer.template as Record<string, any>;

      if (!template) continue;

      // Create an entry with metadata from the shared server
      const serverKey = `${sharedServer.uuid}`;

      // Fetch rating metrics for this shared server
      let rating = 0;
      let ratingCount = 0;
      let installationCount = 0; // Declare installationCount here
      try {
        // For community servers, metrics are linked via external_id (which is the sharedServer.uuid) and source
        const metricsResult = await getServerRatingMetrics({ // Pass args as a single object
          source: McpServerSource.COMMUNITY,
          externalId: sharedServer.uuid
        });
        if (metricsResult.success && metricsResult.metrics) {
          rating = metricsResult.metrics.averageRating;
          ratingCount = metricsResult.metrics.ratingCount;
          installationCount = metricsResult.metrics.installationCount; // Assign value here
        }
      } catch (metricsError) {
        console.error(`Failed to get metrics for community server ${serverKey}:`, metricsError);
      }

      // Determine the display name for 'shared_by' - Use username from users table first, then fallback
      const sharedByName = user?.username || 'Unknown User';
      const profileUrl = user?.username ? `/to/${user.username}` : null;

      results[serverKey] = {
        name: sharedServer.title,
        description: sharedServer.description || '',
        command: template.command || '',
        args: template.args || [],
        envs: Array.isArray(template.env) ? template.env : Object.keys(template.env || {}),
        url: template.url || null,
        source: McpServerSource.COMMUNITY,
        external_id: sharedServer.uuid,
        githubUrl: null,
        package_name: null,
        github_stars: null,
        package_registry: null,
        package_download_count: null,
        // Add additional metadata
        category: template.category,
        tags: template.tags,
        qualifiedName: `community:${sharedServer.uuid}`,
        updated_at: sharedServer.updated_at.toISOString(),
        // Add shared_by and profile URL
        shared_by: sharedByName,
        shared_by_profile_url: profileUrl,
        rating: rating,
        ratingCount: ratingCount,
        installation_count: installationCount, // Use the declared variable
      };
    }

    console.log(`Found ${Object.keys(results).length} community servers`);
    
    return results; // Return directly as metrics are fetched inside
  } catch (error) {
    console.error('Community search error:', error);
    return {}; // Return empty results on error
  }
}