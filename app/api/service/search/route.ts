import { addDays } from 'date-fns';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getServerRatingMetrics } from '@/app/actions/mcp-server-metrics';
import { db } from '@/db';
import { McpServerSource, profilesTable, projectsTable, searchCacheTable, sharedMcpServersTable, users } from '@/db/schema';
import { createErrorResponse, getSafeErrorMessage } from '@/lib/api-errors';
import { RateLimiters } from '@/lib/rate-limiter';
import { registryVPClient } from '@/lib/registry/pluggedin-registry-vp-client';
import { transformPluggedinRegistryToMcpIndex } from '@/lib/registry/registry-transformer';
import type { PaginatedSearchResult, SearchIndex } from '@/types/search';

// Cache TTL in minutes for each source
const CACHE_TTL: Record<McpServerSource, number> = {
  [McpServerSource.PLUGGEDIN]: 1440, // 24 hours
  [McpServerSource.COMMUNITY]: 15, // 15 minutes - community content may change frequently
  [McpServerSource.REGISTRY]: 1, // 1 minute for registry - to quickly reflect newly claimed servers
};

// Note: We no longer cache all registry servers since VP API provides efficient filtering

/**
 * Search for MCP servers
 * Default source: all sources
 * 
 * @param request NextRequest object
 * @returns NextResponse with search results
 */
export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await RateLimiters.api(request);
  
  if (!rateLimitResult.allowed) {
    const response = createErrorResponse('Too many requests', 429, 'RATE_LIMIT_EXCEEDED');
    // Add rate limit headers
    response.headers.set('X-RateLimit-Limit', rateLimitResult.limit.toString());
    response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    response.headers.set('X-RateLimit-Reset', rateLimitResult.reset.toString());
    response.headers.set('Retry-After', Math.ceil((rateLimitResult.reset - Date.now()) / 1000).toString());
    return response;
  }
  
  const url = new URL(request.url);
  const query = url.searchParams.get('query') || '';
  const source = (url.searchParams.get('source') as McpServerSource) || null;
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
  
  // Filter parameters
  const packageRegistry = url.searchParams.get('packageRegistry') as 'npm' | 'docker' | 'pypi' | null;
  const repositorySource = url.searchParams.get('repositorySource');
  const sort = url.searchParams.get('sort') || 'relevance';

  try {
    let results: SearchIndex = {};

    // If source is specified, only search that source
    if (source === McpServerSource.COMMUNITY) {
      // Community servers from local database
      results = await searchCommunity(query);
      const paginated = paginateResults(results, offset, pageSize);
      return NextResponse.json(paginated);
    }

    if (source === McpServerSource.REGISTRY) {
      // Registry servers from registry.plugged.in
      results = await searchRegistry(query, { packageRegistry, repositorySource, sort });
      const paginated = paginateResults(results, offset, pageSize);
      return NextResponse.json(paginated);
    }
    
    // If no source specified or invalid source, return both
    // Get registry results - these already include stats from VP API
    const registryResults = await searchRegistry(query, { packageRegistry, repositorySource, sort });
    Object.assign(results, registryResults);
    
    // Include community results - these need local metrics enrichment
    const communityResults = await searchCommunity(query);
    Object.assign(results, communityResults);
    
    // Paginate and return results
    const paginatedResults = paginateResults(results, offset, pageSize);
    return NextResponse.json(paginatedResults);
  } catch (_error) {
    console.error('Search error:', _error);
    console.error('Error stack:', _error instanceof Error ? _error.stack : 'No stack trace');
    return createErrorResponse(
      getSafeErrorMessage(_error),
      500,
      'SEARCH_FAILED'
    );
  }
}

interface RegistryFilters {
  packageRegistry?: 'npm' | 'docker' | 'pypi' | null;
  repositorySource?: string | null;
  sort?: string;
}

/**
 * Search for MCP servers in the Plugged.in Registry using VP API
 */
async function searchRegistry(query: string, filters: RegistryFilters = {}): Promise<SearchIndex> {
  try {
    // Use enhanced VP API with server-side filtering
    const vpFilters: any = {};
    
    // Add registry_name filter if specified
    if (filters.packageRegistry) {
      vpFilters.registry_name = filters.packageRegistry;
    }
    
    // Add search term if provided
    if (query) {
      vpFilters.search = query;
    }
    
    // Map sort parameter to registry API format
    if (filters.sort === 'recent') {
      vpFilters.sort = 'release_date_desc';
    } else {
      // Default sort for other options (the registry API will handle relevance internally)
      vpFilters.sort = 'release_date_desc';
    }
    
    
    // Use VP API to get servers with stats and server-side filtering
    const response = await registryVPClient.getServersWithStats(100, undefined, McpServerSource.REGISTRY, vpFilters);
    const servers = response.servers || [];
    
    // Transform and index
    const indexed: SearchIndex = {};
    for (const server of servers) {
      // Client-side filter by repository source if needed (not supported by API yet)
      if (filters.repositorySource && server.repository?.url) {
        const repoUrl = server.repository.url.toLowerCase();
        const source = filters.repositorySource.toLowerCase();
        if (!repoUrl.includes(source)) continue;
      }
      
      const mcpIndex = transformPluggedinRegistryToMcpIndex(server);
      
      // Add stats from VP API response
      mcpIndex.installation_count = server.installation_count || 0;
      mcpIndex.rating = server.rating || 0;
      mcpIndex.ratingCount = server.rating_count || 0;
      
      indexed[server.id] = mcpIndex;
    }
    
    
    // Return results - no need to enrich with metrics as stats are already included
    return indexed;
    
  } catch (error) {
    console.error('Registry search failed:', error);
    console.error('Registry search will be unavailable. Returning empty results.');
    // Return empty results on error to allow other sources to work
    return {};
  }
}


/**
 * Enrich search results with rating and installation metrics
 */
async function enrichWithMetrics(results: SearchIndex): Promise<SearchIndex> {
  const enrichedResults = { ...results };
  
  for (const [_key, server] of Object.entries(enrichedResults)) {
    if (!server.source || !server.external_id) {
      continue;
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
    } catch (_error) {
      console.error(`Failed to get metrics for ${_key}:`, _error);
      // Continue with next server even if metrics fail
    }
  }
  
  return enrichedResults;
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
      .where((() => {
        const conditions = [eq(sharedMcpServersTable.is_public, true)];
        
        if (query) {
          conditions.push(
            or(
              ilike(sharedMcpServersTable.title, `%${query}%`),
              ilike(sharedMcpServersTable.description || '', `%${query}%`),
              ilike(users.username, `%${query}%`), // Search by username from users table
              ilike(users.email, `%${query}%`) // Also search by user email
            )!
          );
        }
        
        return and(...conditions);
      })())
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
        // Add claim information
        is_claimed: sharedServer.is_claimed || false,
        claimed_by_user_id: sharedServer.claimed_by_user_id || null,
        claimed_at: sharedServer.claimed_at ? sharedServer.claimed_at.toISOString() : null,
        registry_server_uuid: sharedServer.registry_server_uuid || null,
      };
    }

    
    return results; // Return directly as metrics are fetched inside
  } catch (error) {
    console.error('Community search error:', error);
    return {}; // Return empty results on error
  }
}

/**
 * Check cache for search results
 * 
 * @param source Source to check
 * @param query Search query
 * @returns SearchIndex if cache hit, null if miss
 */
async function checkCache(source: McpServerSource, query: string): Promise<SearchIndex | null> {
  const cachedEntry = await db.query.searchCacheTable.findFirst({
    where: (table, { eq, and, gt }) => (
      and(
        eq(table.source, source),
        eq(table.query, query),
        gt(table.expires_at, new Date())
      )
    ),
  });

  if (cachedEntry) {
    return cachedEntry.results as SearchIndex;
  }

  return null;
}

/**
 * Cache search results
 * 
 * @param source Source of results
 * @param query Search query
 * @param results Search results
 */
async function cacheResults(source: McpServerSource, query: string, results: SearchIndex): Promise<void> {
  const ttl = CACHE_TTL[source] || 60; // Default to 1 hour if source not found
  
  await db.insert(searchCacheTable).values({
    source,
    query,
    results,
    expires_at: addDays(new Date(), ttl / (24 * 60)), // Convert minutes to days
  });
}

/**
 * Paginate search results
 * 
 * @param results Full search results
 * @param offset Offset for pagination
 * @param pageSize Page size
 * @returns Paginated results
 */
function paginateResults(results: SearchIndex, offset: number, pageSize: number): PaginatedSearchResult {
  const keys = Object.keys(results);
  const totalResults = keys.length;
  
  const paginatedKeys = keys.slice(offset, offset + pageSize);
  const paginatedResults: SearchIndex = {};
  
  for (const key of paginatedKeys) {
    paginatedResults[key] = results[key];
  }
  
  return {
    results: paginatedResults,
    total: totalResults,
    offset,
    pageSize,
    hasMore: offset + pageSize < totalResults,
  };
}