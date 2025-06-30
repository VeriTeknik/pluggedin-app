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

export class PluggedinRegistryClient {
  private baseUrl: string;
  
  constructor(baseUrl = process.env.REGISTRY_API_URL || 'https://registry.plugged.in/v0') {
    this.baseUrl = baseUrl;
  }
  
  async listServers(limit = 30, cursor?: string): Promise<ListServersResponse> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (cursor) params.append('cursor', cursor);
    
    const response = await fetch(`${this.baseUrl}/servers?${params}`);
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
    const response = await fetch(`${this.baseUrl}/servers/${id}`);
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
  
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      const data: HealthResponse = await response.json();
      return data.status === 'ok';
    } catch {
      return false;
    }
  }
}