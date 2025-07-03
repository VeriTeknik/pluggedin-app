import { addDays } from 'date-fns';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getServerRatingMetrics } from '@/app/actions/mcp-server-metrics';
import { db } from '@/db';
import { McpServerSource, profilesTable, projectsTable, searchCacheTable, sharedMcpServersTable, users } from '@/db/schema';
import { PluggedinRegistryClient } from '@/lib/registry/pluggedin-registry-client';
import { PluggedinRegistryVPClient } from '@/lib/registry/pluggedin-registry-vp-client';
import { transformPluggedinRegistryToMcpIndex } from '@/lib/registry/registry-transformer';
import type { PaginatedSearchResult, SearchIndex } from '@/types/search';
// Legacy imports - commented out as these sources are deprecated
// import {
//   fetchAwesomeMcpServersList,
//   getGitHubRepoAsMcpServer,
//   getRepoPackageJson,
//   searchGitHubRepos,
// } from '@/utils/github';
// import { getNpmPackageAsMcpServer, searchNpmPackages } from '@/utils/npm';
// import {
//   fetchSmitheryServerDetails,
//   getMcpServerFromSmitheryServer,
//   updateMcpServerWithDetails,
// } from '@/utils/smithery';

// Cache TTL in minutes for each source
const CACHE_TTL: Record<McpServerSource, number> = {
  [McpServerSource.SMITHERY]: 60, // 1 hour - DEPRECATED
  [McpServerSource.NPM]: 360, // 6 hours - DEPRECATED
  [McpServerSource.GITHUB]: 1440, // 24 hours - DEPRECATED
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
  const url = new URL(request.url);
  const query = url.searchParams.get('query') || '';
  const source = (url.searchParams.get('source') as McpServerSource) || null;
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
  
  // New filter parameters for VP API
  const packageRegistry = url.searchParams.get('packageRegistry') as 'npm' | 'docker' | 'pypi' | null;
  const repositorySource = url.searchParams.get('repositorySource');
  const latestOnly = url.searchParams.get('latest') === 'true';
  const version = url.searchParams.get('version');

  try {
    let results: SearchIndex = {};

    // If source is specified, only search that source
    if (source) {
      // Handle community source (keep existing functionality)
      if (source === McpServerSource.COMMUNITY) {
        results = await searchCommunity(query, true); // Pass flag to exclude claimed servers
        const paginated = paginateResults(results, offset, pageSize);
        return NextResponse.json(paginated);
      }

      // Handle registry source
      if (source === McpServerSource.REGISTRY) {
        results = await searchRegistry(query, { packageRegistry, repositorySource, latestOnly, version });
        const paginated = paginateResults(results, offset, pageSize);
        return NextResponse.json(paginated);
      }

      // Check cache first for legacy sources
      const cachedResults = await checkCache(source, query);
      
      if (cachedResults) {
        // Enrich cached results with metrics
        const enrichedResults = await enrichWithMetrics(cachedResults);
        // Paginate enriched results
        const paginatedResults = paginateResults(enrichedResults, offset, pageSize);
        return NextResponse.json(paginatedResults);
      }
      
      // Legacy sources are deprecated - return empty results
      if (source === McpServerSource.SMITHERY || 
          source === McpServerSource.NPM || 
          source === McpServerSource.GITHUB) {
        return NextResponse.json({
          results: {},
          total: 0,
          offset,
          pageSize,
          hasMore: false,
        } as PaginatedSearchResult);
      }
      
      // Return empty results for any other unsupported sources
      return NextResponse.json({
        results: {},
        total: 0,
        offset,
        pageSize,
        hasMore: false,
      } as PaginatedSearchResult);
      
      // Enrich results with metrics before caching
      results = await enrichWithMetrics(results);
      
      // Cache the enriched results
      await cacheResults(source, query, results);
      
      // Paginate and return results
      const paginatedResults = paginateResults(results, offset, pageSize);
      return NextResponse.json(paginatedResults);
    }
    
    // If no source specified, search registry and community
    const registryEnabled = process.env.REGISTRY_ENABLED !== 'false';
    
    if (registryEnabled) {
      // Get registry results
      const registryResults = await searchRegistry(query, { packageRegistry, repositorySource, latestOnly, version });
      Object.assign(results, registryResults);
    }
    
    // Always include community results (excluding claimed servers when showing all)
    const communityResults = await searchCommunity(query, false); // Include claimed servers when showing all
    Object.assign(results, communityResults);
    
    // Paginate and return results
    const paginatedResults = paginateResults(results, offset, pageSize);
    return NextResponse.json(paginatedResults);
  } catch (_error) {
    console.error('Search error:', _error);
    console.error('Error stack:', _error instanceof Error ? _error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Failed to search for MCP servers' },
      { status: 500 }
    );
  }
}

interface RegistryFilters {
  packageRegistry?: 'npm' | 'docker' | 'pypi' | null;
  repositorySource?: string | null;
  latestOnly?: boolean;
  version?: string | null;
}

/**
 * Search for MCP servers in the Plugged.in Registry using VP API
 */
async function searchRegistry(query: string, filters: RegistryFilters = {}): Promise<SearchIndex> {
  console.log('searchRegistry called with query:', query, 'filters:', filters);
  try {
    const vpClient = new PluggedinRegistryVPClient();
    
    // Prepare VP API filters
    const vpFilters = {
      package_registry: filters.packageRegistry || undefined,
      repository_source: filters.repositorySource || undefined,
      latest: filters.latestOnly || undefined,
      version: filters.version || undefined,
    };
    
    console.log('Fetching from VP API with filters:', vpFilters);
    
    // Use VP API to search with filters
    const servers = await vpClient.searchServers(query, vpFilters);
    
    // Transform and index
    const indexed: SearchIndex = {};
    for (const server of servers) {
      const mcpIndex = transformPluggedinRegistryToMcpIndex(server);
      
      // Debug log for special servers
      if (server.name?.includes('youtube') || server.name?.includes('sqlite')) {
        console.log('[Search API] Transforming server:', {
          name: server.name,
          packages: server.packages,
          transformed: mcpIndex
        });
      }
      
      indexed[server.id] = mcpIndex;
    }
    
    console.log(`[Search API] Found ${Object.keys(indexed).length} servers`);
    
    // Return results
    return indexed;
    
  } catch (error) {
    console.error('Registry search failed:', error);
    return {}; // Return empty results on error
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
 * Search for MCP servers in Smithery
 * DEPRECATED - Legacy source no longer supported
 * 
 * @param query Search query
 * @returns SearchIndex of results
 */
/*
async function searchSmithery(query: string): Promise<SearchIndex> {
  const apiKey = process.env.SMITHERY_API_KEY;
  if (!apiKey) {
    throw new Error('SMITHERY_API_KEY is not defined');
  }

  const url = new URL('https://registry.smithery.ai/servers');
  if (query) {
    url.searchParams.append('q', query);
  }
  url.searchParams.append('pageSize', '50'); // Get a reasonable number of results

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Smithery API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as SmitherySearchResponse;
  
  // Convert to our SearchIndex format
  const results: SearchIndex = {};
  
  for (const server of data.servers) {
    let mcpServer = getMcpServerFromSmitheryServer(server);
    try {
      // Fetch details to get command/args/url
      const details = await fetchSmitheryServerDetails(server.qualifiedName);
      mcpServer = updateMcpServerWithDetails(mcpServer, details);
    } catch (detailError) {
      console.error(`Failed to fetch details for Smithery server ${server.qualifiedName}:`, detailError);
      // Continue with the basic info if details fail
    }
    results[server.qualifiedName] = mcpServer;
  }

  // Enrich results with metrics
  return await enrichWithMetrics(results);
}
*/

/**
 * Search for MCP servers on NPM
 * DEPRECATED - Legacy source no longer supported
 * 
 * @param query Search query
 * @returns SearchIndex of results
 */
/*
async function searchNpm(query: string): Promise<SearchIndex> {
  try {
    const data = await searchNpmPackages(query);
    
    // Convert to our SearchIndex format
    const results: SearchIndex = {};
    
    for (const item of data.objects) {
      const mcpServer = getNpmPackageAsMcpServer(item.package);
      results[item.package.name] = mcpServer;
    }
    
    // Enrich results with metrics
    return await enrichWithMetrics(results);
  } catch (_error) {
    console.error('NPM search error:', _error);
    return {}; // Return empty results on error
  }
}
*/

/**
 * Search for MCP servers on GitHub
 * DEPRECATED - Legacy source no longer supported
 * 
 * @param query Search query
 * @returns SearchIndex of results
 */
/*
async function searchGitHub(query: string): Promise<SearchIndex> {
  try {
    // Try to search GitHub for repos
    const repos = await searchGitHubRepos(query);
    
    // Also fetch from awesome-mcp-servers list if no query
    let awesomeRepos: any[] = [];
    if (!query) {
      try {
        awesomeRepos = await fetchAwesomeMcpServersList();
      } catch (_error) {
        console.error('Error fetching awesome-mcp-servers list:', _error);
      }
    }
    
    // Combine and deduplicate
    const allRepos = [...repos];
    for (const repo of awesomeRepos) {
      if (!allRepos.some(r => r.full_name === repo.full_name)) {
        allRepos.push(repo);
      }
    }
    
    // Convert to our SearchIndex format
    const results: SearchIndex = {};
    
    for (const repo of allRepos) {
      // Try to fetch package.json for better metadata
      let packageJson = null;
      try {
        packageJson = await getRepoPackageJson(repo);
      } catch (_error) {
        // Continue without package.json
      }
      
      const mcpServer = getGitHubRepoAsMcpServer(repo, packageJson);
      results[repo.full_name] = mcpServer;
    }
    
    // Enrich results with metrics
    return await enrichWithMetrics(results);
  } catch (_error) {
    console.error('GitHub search error:', _error);
    return {}; // Return empty results on error
  }
}
*/

/**
 * Search for community MCP servers - implementation to show shared servers
 * 
 * @param query Search query
 * @param excludeClaimed Whether to exclude servers that have been claimed
 * @returns SearchIndex of results
 */
async function searchCommunity(query: string, excludeClaimed: boolean = true): Promise<SearchIndex> {
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
        
        if (excludeClaimed) {
          conditions.push(eq(sharedMcpServersTable.is_claimed, false));
        }
        
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

    console.log(`Found ${Object.keys(results).length} community servers`);
    
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