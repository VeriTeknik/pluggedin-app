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

// Valid package registry types (including 'remote' for SSE/HTTP transport types)
const VALID_REGISTRIES = ['npm', 'pypi', 'oci', 'mcpb', 'nuget', 'remote'] as const;
type PackageRegistry = typeof VALID_REGISTRIES[number];

// Security limits for input validation
const MAX_REGISTRIES = 10;
const VALID_REGISTRY_PATTERN = /^[a-z0-9-]+$/;

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
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0') || 0);
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '10') || 10));
  
  // Filter parameters with input validation
  const packageRegistryParam = url.searchParams.get('packageRegistry');
  const packageRegistries = packageRegistryParam
    ? packageRegistryParam
        .split(',')
        .filter(Boolean)
        .map(r => r.toLowerCase().trim())
        .filter(r => VALID_REGISTRY_PATTERN.test(r))
        .filter(r => VALID_REGISTRIES.includes(r as PackageRegistry))
        .slice(0, MAX_REGISTRIES)
    : [];
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
      const registryResult = await searchRegistry(query, { packageRegistries, repositorySource, sort });
      const paginated = paginateResults(registryResult.indexed, offset, pageSize, registryResult.totalCount);
      return NextResponse.json(paginated);
    }

    // If no source specified or invalid source, return both
    // Get registry results - these already include stats from VP API
    const registryResult = await searchRegistry(query, { packageRegistries, repositorySource, sort });
    Object.assign(results, registryResult.indexed);

    // Include community results - these need local metrics enrichment
    const communityResults = await searchCommunity(query);
    Object.assign(results, communityResults);

    // Paginate and return results
    // Note: When combining sources, we can't use totalCount from API as it would be inaccurate
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
  packageRegistries?: string[];
  repositorySource?: string | null;
  sort?: string;
}

interface RegistrySearchResult {
  indexed: SearchIndex;
  totalCount?: number;
}

/**
 * Search for MCP servers in the Plugged.in Registry using VP API
 */
async function searchRegistry(query: string, filters: RegistryFilters = {}): Promise<RegistrySearchResult> {
  try {
    // Use enhanced VP API with server-side filtering
    const vpFilters: any = {};

    // Handle multiple registry types - the enhanced API supports comma-separated values
    if (filters.packageRegistries && filters.packageRegistries.length > 0) {
      // Pass all registries to the enhanced API, it handles filtering server-side
      vpFilters.registry_name = filters.packageRegistries.join(',');
    }

    // Add search term if provided
    if (query) {
      vpFilters.search = query;
    }

    // Map sort parameter to registry API format
    // Only map sorts that backend supports; relevance and stars are handled client-side
    if (filters.sort === 'recent') {
      vpFilters.sort = 'updated';
    } else if (filters.sort === 'rating') {
      vpFilters.sort = 'rating_desc';
    } else if (filters.sort === 'popularity') {
      vpFilters.sort = 'installs_desc';
    }
    // For 'relevance' and 'stars', don't set backend sort - client-side sorting will handle it

    // Fetch servers using enhanced endpoint
    // The enhanced endpoint handles all filtering server-side, no need for client-side filtering
    const response = await registryVPClient.getAllServersWithStats(McpServerSource.REGISTRY, vpFilters);

    // Transform and index
    const indexed: SearchIndex = {};
    for (const server of response.servers) {

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

    // Return results with total count from API
    return {
      indexed,
      totalCount: response.total_count
    };

  } catch (error) {
    console.error('Registry search failed:', error);
    console.error('Registry search will be unavailable. Returning empty results.');
    // Return empty results on error to allow other sources to work
    return {
      indexed: {},
      totalCount: 0
    };
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
 * Sanitize search query to prevent SQL injection
 */
function sanitizeSearchQuery(query: string): string {
  if (!query || typeof query !== 'string') return '';

  // Escape special LIKE/ILIKE characters (%, _, \)
  const sanitized = query
    .replace(/\\/g, '\\\\')  // Escape backslash first
    .replace(/%/g, '\\%')     // Escape %
    .replace(/_/g, '\\_')     // Escape _
    .trim();

  // Limit length to prevent DoS
  return sanitized.substring(0, 100);
}

/**
 * Search for community MCP servers - implementation to show shared servers
 *
 * @param query Search query
 * @returns SearchIndex of results
 */
async function searchCommunity(query: string): Promise<SearchIndex> {
  try {
    // Sanitize the search query to prevent SQL injection
    const sanitizedQuery = sanitizeSearchQuery(query);

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

        if (sanitizedQuery) {
          conditions.push(
            or(
              ilike(sharedMcpServersTable.title, `%${sanitizedQuery}%`),
              ilike(sharedMcpServersTable.description || '', `%${sanitizedQuery}%`),
              ilike(users.username, `%${sanitizedQuery}%`) // Search by username from users table
              // REMOVED: email search to prevent information disclosure/GDPR violation
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

    // Collect all server UUIDs for batch metrics fetching
    const serverUuids = resultsWithJoins.map(r => r.sharedServer.uuid);
    
    // Fetch all metrics in parallel to avoid N+1 queries
    const metricsPromises = serverUuids.map(uuid => 
      getServerRatingMetrics({
        source: McpServerSource.COMMUNITY,
        externalId: uuid
      }).catch(error => {
        console.error(`Failed to get metrics for community server ${uuid}:`, error);
        return { success: false, metrics: null };
      })
    );
    
    const metricsResults = await Promise.all(metricsPromises);
    
    // Create a map of uuid to metrics for quick lookup
    const metricsMap = new Map<string, any>();
    serverUuids.forEach((uuid, index) => {
      const result = metricsResults[index];
      if (result.success && result.metrics) {
        metricsMap.set(uuid, result.metrics);
      }
    });

    for (const { sharedServer, profile, user } of resultsWithJoins) {
      // We'll use the template field which contains the sanitized MCP server data
      const template = sharedServer.template as Record<string, any>;

      if (!template) continue;

      // Create an entry with metadata from the shared server
      const serverKey = `${sharedServer.uuid}`;

      // Get rating metrics from the pre-fetched map
      let rating = 0;
      let ratingCount = 0;
      let installationCount = 0;
      
      const metrics = metricsMap.get(sharedServer.uuid);
      if (metrics) {
        rating = metrics.averageRating;
        ratingCount = metrics.ratingCount;
        installationCount = metrics.installationCount;
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
 * @param totalCount Optional total count from API (if not provided, uses results length)
 * @returns Paginated results
 *
 * IMPORTANT: When totalCount is not provided, the fallback uses keys.length which only
 * represents the number of results currently loaded, not the total available results.
 * This can lead to inaccurate pagination when combining multiple sources or when the
 * full result set is not loaded. Always provide totalCount when available from the API.
 */
function paginateResults(results: SearchIndex, offset: number, pageSize: number, totalCount?: number): PaginatedSearchResult {
  const keys = Object.keys(results);
  const totalResults = totalCount ?? keys.length; // Use provided totalCount or fall back to keys.length (see IMPORTANT note above)

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