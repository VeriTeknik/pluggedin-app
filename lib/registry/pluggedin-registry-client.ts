import { validateInternalUrl } from '@/lib/url-validator';

interface PluggedinRegistryServer {
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
    }>;
  }>;
}

interface ListServersResponse {
  servers: PluggedinRegistryServer[];
  metadata?: {
    next_cursor?: string;
    count?: number;
  };
}

interface HealthResponse {
  status: string;
  github_client_id?: string;
}

interface PublishServerData {
  name: string;
  description: string;
  packages: Array<{
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
  repository: {
    url: string;
    source: string;
    id: string;
  };
  version_detail: {
    version: string;
  };
}

interface PublishResponse {
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
}

export class PluggedinRegistryClient {
  private baseUrl: string;
  
  constructor(baseUrl = process.env.REGISTRY_API_URL || 'https://registry.plugged.in/v0') {
    // Validate the base URL to prevent SSRF
    const validatedUrl = validateInternalUrl(baseUrl);
    this.baseUrl = validatedUrl.toString();
  }
  
  async listServers(limit = 30, cursor?: string): Promise<ListServersResponse> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (cursor) params.append('cursor', cursor);
    
    const url = validateInternalUrl(`${this.baseUrl}/servers?${params}`);
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Registry error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }
  
  async getAllServers(): Promise<PluggedinRegistryServer[]> {
    const allServers: PluggedinRegistryServer[] = [];
    let cursor: string | undefined;
    
    do {
      const response = await this.listServers(100, cursor);
      allServers.push(...response.servers);
      cursor = response.metadata?.next_cursor;
    } while (cursor);
    
    return allServers;
  }
  
  async getServerDetails(id: string): Promise<PluggedinRegistryServer> {
    const url = validateInternalUrl(`${this.baseUrl}/servers/${id}`);
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Server not found: ${id}`);
    }
    
    return response.json();
  }
  
  async searchServers(query: string): Promise<PluggedinRegistryServer[]> {
    // Get all servers and filter client-side (until registry adds search endpoint)
    const allServers = await this.getAllServers();
    
    if (!query) return allServers;
    
    const searchQuery = query.toLowerCase();
    return allServers.filter(server => 
      server.name.toLowerCase().includes(searchQuery) ||
      server.description?.toLowerCase().includes(searchQuery) ||
      server.repository?.url?.toLowerCase().includes(searchQuery)
    );
  }

  async getServer(registryId: string): Promise<PluggedinRegistryServer | null> {
    try {
      // First try to get by exact ID
      try {
        return await this.getServerDetails(registryId);
      } catch {
        // If that fails, search by name
        const allServers = await this.getAllServers();
        return allServers.find(server => 
          server.name === registryId || 
          server.id === registryId
        ) || null;
      }
    } catch (error) {
      console.error('Error getting server:', error);
      return null;
    }
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      const url = validateInternalUrl(`${this.baseUrl}/health`);
      const response = await fetch(url.toString());
      const data: HealthResponse = await response.json();
      return data.status === 'ok';
    } catch {
      return false;
    }
  }
  
  async publishServer(
    serverData: PublishServerData,
    authToken: string
  ): Promise<PublishResponse> {
    const url = validateInternalUrl(`${this.baseUrl}/publish`);
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(serverData),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to publish server: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    return response.json();
  }
}