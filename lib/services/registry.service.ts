/**
 * Registry Service
 * Handles communication with the pluggedin-registry microservice
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export interface RegistryServer {
  id: string;
  name: string;
  description: string;
  source: string;
  repository?: string;
  metadata: {
    verified: boolean;
    github_stars?: number;
    category?: string;
    tags?: string[];
    install_count?: number;
    rating?: number;
  };
  claimed_at?: string;
  created_at: string;
  updated_at?: string;
  is_claimed?: boolean;
}

export interface SearchResult {
  results: RegistryServer[];
  total: number;
  offset: number;
  limit: number;
  took?: number;
  aggregations?: any;
}

export interface DiscoverResponse<T = any> {
  servers?: RegistryServer[];
  categories?: Array<{ name: string; count: number }>;
  total?: number;
  updated_at: string;
  [key: string]: any;
}

class RegistryService {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.REGISTRY_API_URL || 'http://localhost:3001';
    this.apiKey = process.env.REGISTRY_INTERNAL_API_KEY || '';
  }

  /**
   * Make authenticated request to internal API
   */
  private async makeInternalRequest<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'x-user-id': session.user.id,
        'x-user-email': session.user.email || '',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      const errorMessage = typeof errorData === 'string' ? errorData : 
                          errorData.error || errorData.message || 
                          `Registry API error: ${response.status}`;
      throw new Error(errorMessage);
    }

    return response.json();
  }

  /**
   * Make public request (no auth required)
   */
  private async makePublicRequest<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      const errorMessage = typeof errorData === 'string' ? errorData : 
                          errorData.error || errorData.message || 
                          JSON.stringify(errorData) || 
                          `Registry API error: ${response.status}`;
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // Public API Methods

  /**
   * Search for MCP servers
   */
  async search(params: {
    query?: string;
    category?: string;
    verified?: boolean;
    tags?: string[];
    limit?: number;
    offset?: number;
    sort?: string;
  }): Promise<SearchResult> {
    const searchParams = new URLSearchParams();
    if (params.query) searchParams.set('query', params.query);
    if (params.category) searchParams.set('category', params.category);
    if (params.verified !== undefined) searchParams.set('verified', String(params.verified));
    if (params.tags?.length) searchParams.set('tags', params.tags.join(','));
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.offset) searchParams.set('offset', String(params.offset));
    if (params.sort) searchParams.set('sort', params.sort);

    return this.makePublicRequest(`/api/v1/search?${searchParams}`);
  }

  /**
   * Get featured servers
   */
  async getFeatured(): Promise<DiscoverResponse> {
    return this.makePublicRequest('/api/v1/discover/featured');
  }

  /**
   * Get trending servers
   */
  async getTrending(): Promise<DiscoverResponse> {
    return this.makePublicRequest('/api/v1/discover/trending');
  }

  /**
   * Get recent servers
   */
  async getRecent(): Promise<DiscoverResponse> {
    return this.makePublicRequest('/api/v1/discover/recent');
  }

  /**
   * Get server categories
   */
  async getCategories(): Promise<DiscoverResponse> {
    return this.makePublicRequest('/api/v1/discover/categories');
  }

  /**
   * Get registry statistics
   */
  async getStats(): Promise<DiscoverResponse> {
    return this.makePublicRequest('/api/v1/discover/stats');
  }

  /**
   * Get server details
   */
  async getServer(id: string): Promise<RegistryServer> {
    return this.makePublicRequest(`/api/v1/servers/${id}`);
  }

  // Internal API Methods (require authentication)

  /**
   * Get unclaimed servers
   */
  async getUnclaimedServers(params?: {
    source?: string;
    limit?: number;
    offset?: number;
  }): Promise<SearchResult> {
    const searchParams = new URLSearchParams();
    if (params?.source) searchParams.set('source', params.source);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));

    return this.makeInternalRequest(`/api/v1/internal/claim/unclaimed?${searchParams}`);
  }

  /**
   * Get servers claimed by the current user
   */
  async getMyServers(params?: {
    limit?: number;
    offset?: number;
  }): Promise<SearchResult> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));

    return this.makeInternalRequest(`/api/v1/internal/claim/my-servers?${searchParams}`);
  }

  /**
   * Claim a server
   */
  async claimServer(serverId: string, data?: {
    proof_url?: string;
    notes?: string;
  }): Promise<{
    message: string;
    server: {
      id: string;
      name: string;
      claimed_at: string;
    };
  }> {
    return this.makeInternalRequest(`/api/v1/internal/claim/${serverId}`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }

  /**
   * Unclaim a server
   */
  async unclaimServer(serverId: string, reason?: string): Promise<{
    message: string;
    server: {
      id: string;
      name: string;
    };
  }> {
    return this.makeInternalRequest(`/api/v1/internal/claim/${serverId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
  }

  /**
   * Publish a new server to the registry
   */
  async publishServer(data: {
    name: string;
    description: string;
    repository: {
      url: string;
      source: string;
      id: string;
    };
    capabilities: any;
    versions: Array<{
      version: string;
      release_date: string;
      is_latest?: boolean;
    }>;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    tags?: string[];
    category?: string;
  }): Promise<{
    message: string;
    server: RegistryServer;
  }> {
    return this.makeInternalRequest('/api/v1/internal/registry/publish', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update a server in the registry
   */
  async updateServer(serverId: string, data: Partial<{
    description: string;
    capabilities: any;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    tags?: string[];
    category?: string;
  }>): Promise<{
    message: string;
    server: RegistryServer;
  }> {
    return this.makeInternalRequest(`/api/v1/internal/registry/${serverId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete a server from the registry
   */
  async deleteServer(serverId: string): Promise<{
    message: string;
  }> {
    return this.makeInternalRequest(`/api/v1/internal/registry/${serverId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Add a new version to a server
   */
  async addServerVersion(serverId: string, data: {
    version: string;
    release_date?: string;
    changelog?: string;
  }): Promise<{
    message: string;
    version: any;
  }> {
    return this.makeInternalRequest(`/api/v1/internal/registry/${serverId}/version`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Verify server ownership
   */
  async verifyServer(serverId: string): Promise<{
    message: string;
    server: {
      id: string;
      name: string;
    };
    verification: {
      status: string;
      methods: string[];
    };
  }> {
    return this.makeInternalRequest(`/api/v1/internal/claim/${serverId}/verify`, {
      method: 'POST',
    });
  }

  /**
   * Import a GitHub repository
   */
  async importGitHubRepository(repositoryUrl: string, options?: {
    installationId?: string | null;
    userId?: string;
  }): Promise<{
    success: boolean;
    error?: string;
    data?: {
      server: any;
      extraction?: {
        confidence: any;
        warnings: string[];
      };
      isNew: boolean;
    };
  }> {
    try {
      const response = await this.makeInternalRequest('/api/v1/internal/github/import', {
        method: 'POST',
        body: JSON.stringify({
          repository_url: repositoryUrl,
          installation_id: options?.installationId,
        }),
      });
      
      return {
        success: true,
        data: response,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import repository',
      };
    }
  }
}

// Export singleton instance
export const registryService = new RegistryService();