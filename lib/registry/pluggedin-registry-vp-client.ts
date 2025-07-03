/**
 * VP API Client for enhanced Plugged.in Registry filtering
 * Implements the v-plugged API with advanced filtering capabilities
 */

export interface VPServer {
  id: string;
  name: string;
  description: string;
  repository?: {
    url: string;
    source: string;
    id: string;
  };
  version_detail?: {
    version: string;
    release_date: string;
    is_latest: boolean;
  };
  packages?: Array<{
    registry_name: string;
    name: string;
    version: string;
    runtime_hint?: string;
    package_arguments?: any[];
    runtime_arguments?: any[];
    environment_variables?: Array<{
      name: string;
      description?: string;
      required?: boolean;
    }>;
  }>;
  remotes?: any[];
}

export interface VPListServersResponse {
  servers: VPServer[];
  metadata: {
    next_cursor?: string;
    count: number;
  };
}

export interface VPQueryParams {
  cursor?: string;
  limit?: number;
  name?: string;
  repository_url?: string;
  repository_source?: string;
  version?: string;
  latest?: boolean;
  package_registry?: 'npm' | 'docker' | 'pypi';
}

export class PluggedinRegistryVPClient {
  private baseUrl: string;
  
  constructor(baseUrl = process.env.REGISTRY_API_URL || 'https://registry.plugged.in') {
    // Use /vp endpoint for v-plugged API
    this.baseUrl = baseUrl.replace(/\/v\d+$/, '') + '/vp';
  }
  
  /**
   * List servers with advanced filtering
   */
  async listServersWithFilters(params: VPQueryParams = {}): Promise<VPListServersResponse> {
    const queryParams = new URLSearchParams();
    
    // Add parameters only if they exist
    if (params.cursor) queryParams.append('cursor', params.cursor);
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.name) queryParams.append('name', params.name);
    if (params.repository_url) queryParams.append('repository_url', params.repository_url);
    if (params.repository_source) queryParams.append('repository_source', params.repository_source);
    if (params.version) queryParams.append('version', params.version);
    if (params.latest !== undefined) queryParams.append('latest', params.latest.toString());
    if (params.package_registry) queryParams.append('package_registry', params.package_registry);
    
    const url = `${this.baseUrl}/servers${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    console.log('[VP Client] Fetching:', url);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`VP API error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }
  
  /**
   * Get detailed server information
   */
  async getServerDetails(id: string): Promise<VPServer> {
    const response = await fetch(`${this.baseUrl}/servers/${id}`);
    if (!response.ok) {
      throw new Error(`Server not found: ${id}`);
    }
    
    return response.json();
  }
  
  /**
   * Search servers with text query and filters
   * Note: Currently does client-side filtering until the API supports search query parameter
   */
  async searchServers(query: string, filters: Omit<VPQueryParams, 'cursor' | 'limit'> = {}): Promise<VPServer[]> {
    const allServers: VPServer[] = [];
    let cursor: string | undefined;
    
    // Fetch all pages with filters
    do {
      const response = await this.listServersWithFilters({
        ...filters,
        cursor,
        limit: 100, // Max page size
      });
      
      allServers.push(...response.servers);
      cursor = response.metadata?.next_cursor;
    } while (cursor);
    
    // If no query, return all filtered results
    if (!query) return allServers;
    
    // Client-side text search (until API supports query parameter)
    const searchQuery = query.toLowerCase();
    return allServers.filter(server => 
      server.name.toLowerCase().includes(searchQuery) ||
      server.description?.toLowerCase().includes(searchQuery) ||
      server.repository?.url?.toLowerCase().includes(searchQuery) ||
      server.packages?.some(pkg => pkg.name.toLowerCase().includes(searchQuery))
    );
  }
  
  /**
   * Get all servers with pagination (for caching purposes)
   */
  async getAllServers(filters: Omit<VPQueryParams, 'cursor' | 'limit'> = {}): Promise<VPServer[]> {
    const allServers: VPServer[] = [];
    let cursor: string | undefined;
    
    do {
      const response = await this.listServersWithFilters({
        ...filters,
        cursor,
        limit: 100,
      });
      
      allServers.push(...response.servers);
      cursor = response.metadata?.next_cursor;
      
      // Log progress
      console.log(`[VP Client] Fetched ${allServers.length} servers so far...`);
    } while (cursor);
    
    console.log(`[VP Client] Total servers fetched: ${allServers.length}`);
    return allServers;
  }
}