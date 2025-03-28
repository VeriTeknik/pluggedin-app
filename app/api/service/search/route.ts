import { addDays } from 'date-fns';
import { NextRequest, NextResponse } from 'next/server';

import { getServerRatingMetrics } from '@/app/actions/mcp-server-metrics';
import { db } from '@/db';
import { McpServerSource, searchCacheTable } from '@/db/schema';
import { PaginatedSearchResult, SearchIndex, SmitherySearchResponse } from '@/types/search';
import { fetchAwesomeMcpServersList, getGitHubRepoAsMcpServer, getRepoPackageJson, searchGitHubRepos } from '@/utils/github';
import { getNpmPackageAsMcpServer, searchNpmPackages } from '@/utils/npm';
import { 
  fetchSmitheryServerDetails, 
  getMcpServerFromSmitheryServer, 
  updateMcpServerWithDetails 
} from '@/utils/smithery';

// Define cache TTL in minutes
const CACHE_TTL: Record<McpServerSource, number> = {
  [McpServerSource.SMITHERY]: 60, // 1 hour
  [McpServerSource.NPM]: 360, // 6 hours
  [McpServerSource.GITHUB]: 1440, // 24 hours
  [McpServerSource.PLUGGEDIN]: 1440, // 24 hours
};

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

  try {
    let results: SearchIndex = {};

    // If source is specified, only search that source
    if (source) {
      // Check cache first
      const cachedResults = await checkCache(source, query);
      
      if (cachedResults) {
        // Paginate cached results
        const paginatedResults = paginateResults(cachedResults, offset, pageSize);
        return NextResponse.json(paginatedResults);
      }
      
      // If not in cache, fetch data from source
      switch (source) {
        case McpServerSource.SMITHERY:
          results = await searchSmithery(query);
          break;
        case McpServerSource.NPM:
          results = await searchNpm(query);
          break;
        case McpServerSource.GITHUB:
          results = await searchGitHub(query);
          break;
        default:
          // Return empty results for unsupported sources
          return NextResponse.json({
            results: {},
            total: 0,
            offset,
            pageSize,
            hasMore: false,
          } as PaginatedSearchResult);
      }
      
      // Cache results
      await cacheResults(source, query, results);
      
      // Paginate and return results
      const paginatedResults = paginateResults(results, offset, pageSize);
      return NextResponse.json(paginatedResults);
    }
    
    // If no source specified, search all (with caching per source)
    // For now, we'll search each one sequentially
    // In a production environment, we might want to parallelize these requests
    
    // Check if we have ALL sources cached for this query
    const cachedSmithery = await checkCache(McpServerSource.SMITHERY, query);
    const cachedNpm = await checkCache(McpServerSource.NPM, query);
    const cachedGitHub = await checkCache(McpServerSource.GITHUB, query);
    
    // If all are cached, combine and return
    if (cachedSmithery && cachedNpm && cachedGitHub) {
      const combinedResults: SearchIndex = {};
      
      // Add smithery results with namespace prefix
      Object.entries(cachedSmithery).forEach(([key, value]) => {
        combinedResults[`smithery:${key}`] = value;
      });
      
      // Add npm results with namespace prefix
      Object.entries(cachedNpm).forEach(([key, value]) => {
        combinedResults[`npm:${key}`] = value;
      });
      
      // Add github results with namespace prefix
      Object.entries(cachedGitHub).forEach(([key, value]) => {
        combinedResults[`github:${key}`] = value;
      });
      
      // Paginate and return
      const paginatedResults = paginateResults(combinedResults, offset, pageSize);
      return NextResponse.json(paginatedResults);
    }
    
    // Otherwise, fetch what's needed and merge
    const smitheryResults = cachedSmithery || await searchSmithery(query);
    if (!cachedSmithery) {
      await cacheResults(McpServerSource.SMITHERY, query, smitheryResults);
    }
    
    const npmResults = cachedNpm || await searchNpm(query);
    if (!cachedNpm) {
      await cacheResults(McpServerSource.NPM, query, npmResults);
    }
    
    const githubResults = cachedGitHub || await searchGitHub(query);
    if (!cachedGitHub) {
      await cacheResults(McpServerSource.GITHUB, query, githubResults);
    }
    
    // Combine all results under namespaced keys to avoid collisions
    results = {} as SearchIndex;
    
    // Add smithery results with namespace prefix
    Object.entries(smitheryResults).forEach(([key, value]) => {
      results[`smithery:${key}`] = value;
    });
    
    // Add npm results with namespace prefix
    Object.entries(npmResults).forEach(([key, value]) => {
      results[`npm:${key}`] = value;
    });
    
    // Add github results with namespace prefix
    Object.entries(githubResults).forEach(([key, value]) => {
      results[`github:${key}`] = value;
    });
    
    // Paginate and return results
    const paginatedResults = paginateResults(results, offset, pageSize);
    return NextResponse.json(paginatedResults);
  } catch (_error) {
    console.error('Search error:', _error);
    return NextResponse.json(
      { error: 'Failed to search for MCP servers' },
      { status: 500 }
    );
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
      const metricsResult = await getServerRatingMetrics(
        undefined, // No server UUID for external sources
        server.external_id,
        server.source
      );
      
      if (metricsResult.success && metricsResult.metrics) {
        // Add metrics to server data
        server.rating = metricsResult.metrics.averageRating;
        server.rating_count = metricsResult.metrics.ratingCount;
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
 * 
 * @param query Search query
 * @returns SearchIndex of results
 */
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

/**
 * Search for MCP servers on NPM
 * 
 * @param query Search query
 * @returns SearchIndex of results
 */
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

/**
 * Search for MCP servers on GitHub
 * 
 * @param query Search query
 * @returns SearchIndex of results
 */
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
  const ttlMinutes = CACHE_TTL[source] || 60; // Default 1 hour
  const expiresAt = addDays(new Date(), ttlMinutes / (24 * 60)); // Convert minutes to days

  await db.insert(searchCacheTable).values({
    source,
    query,
    results,
    expires_at: expiresAt,
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
