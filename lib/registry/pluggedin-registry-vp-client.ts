import { McpServerSource } from '@/db/schema';

// Extended interfaces with stats
export interface ExtendedServer {
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
  // Stats fields
  installation_count: number;
  rating: number;
  rating_count: number;
  active_installs?: number;
  weekly_growth?: number;
}

export interface ExtendedServersResponse {
  servers: ExtendedServer[];
}

export interface ExtendedServerResponse {
  server: ExtendedServer;
}

export interface ServerStats {
  server_id: string;
  installation_count: number;
  rating: number;
  rating_count: number;
  active_installs?: number;
  daily_active_users?: number;
  monthly_active_users?: number;
}

export interface StatsResponse {
  stats: ServerStats;
}

export interface RatingRequest {
  rating: number;
  source?: McpServerSource;
}

export interface RatingResponse {
  success: boolean;
  stats?: ServerStats;
}

export interface InstallRequest {
  source?: McpServerSource;
  user_id?: string;
  version?: string;
  platform?: string;
  timestamp?: number;
}

export interface InstallResponse {
  success: boolean;
  stats?: ServerStats;
}

export interface GlobalStats {
  total_servers: number;
  total_installs: number;
  active_servers: number;
  average_rating: number;
  last_updated: string;
}

export interface LeaderboardEntry {
  server: ExtendedServer;
  rank: number;
}

export interface LeaderboardResponse {
  data: LeaderboardEntry[];
}

export interface TrendingResponse {
  servers: ExtendedServer[];
}

export class PluggedinRegistryVPClient {
  private baseUrl: string;
  private vpUrl: string;
  
  constructor(baseUrl = process.env.REGISTRY_API_URL || 'https://registry.plugged.in') {
    // Remove /v0 if present in baseUrl
    this.baseUrl = baseUrl.replace(/\/v0$/, '');
    this.vpUrl = `${this.baseUrl}/vp`;
  }
  
  // Get servers with stats
  async getServersWithStats(
    limit = 30, 
    cursor?: string, 
    source?: McpServerSource
  ): Promise<ExtendedServersResponse> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (cursor) params.append('cursor', cursor);
    if (source) params.append('source', source);
    
    const response = await fetch(`${this.vpUrl}/servers?${params}`);
    if (!response.ok) {
      throw new Error(`Registry VP error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }
  
  // Get single server with stats
  async getServerWithStats(serverId: string): Promise<ExtendedServer> {
    const response = await fetch(`${this.vpUrl}/servers/${serverId}`);
    if (!response.ok) {
      throw new Error(`Server not found: ${serverId}`);
    }
    
    const data: ExtendedServerResponse = await response.json();
    return data.server;
  }
  
  // Get all servers with stats
  async getAllServersWithStats(source?: McpServerSource): Promise<ExtendedServer[]> {
    const allServers: ExtendedServer[] = [];
    let cursor: string | undefined;
    
    do {
      const response = await this.getServersWithStats(100, cursor, source);
      allServers.push(...response.servers);
      // VP API doesn't use cursor yet, but ready for when it does
      cursor = undefined; // response.metadata?.next_cursor;
    } while (cursor);
    
    return allServers;
  }
  
  // Track installation
  async trackInstallation(
    serverId: string,
    data: InstallRequest = {}
  ): Promise<InstallResponse> {
    try {
      const response = await fetch(`${this.vpUrl}/servers/${serverId}/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        console.error('Failed to track installation:', response.status);
        return { success: false };
      }
      
      return response.json();
    } catch (error) {
      console.error('Error tracking installation:', error);
      return { success: false };
    }
  }
  
  // Submit rating
  async submitRating(
    serverId: string,
    rating: number,
    source?: McpServerSource
  ): Promise<RatingResponse> {
    try {
      const response = await fetch(`${this.vpUrl}/servers/${serverId}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rating, source } as RatingRequest),
      });
      
      if (!response.ok) {
        console.error('Failed to submit rating:', response.status);
        return { success: false };
      }
      
      return response.json();
    } catch (error) {
      console.error('Error submitting rating:', error);
      return { success: false };
    }
  }
  
  // Get server stats only
  async getServerStats(serverId: string): Promise<ServerStats | null> {
    try {
      const response = await fetch(`${this.vpUrl}/servers/${serverId}/stats`);
      if (!response.ok) {
        return null;
      }
      
      const data: StatsResponse = await response.json();
      return data.stats;
    } catch (error) {
      console.error('Error getting server stats:', error);
      return null;
    }
  }
  
  // Get global stats
  async getGlobalStats(): Promise<GlobalStats | null> {
    try {
      const response = await fetch(`${this.vpUrl}/stats/global`);
      if (!response.ok) {
        return null;
      }
      
      return response.json();
    } catch (error) {
      console.error('Error getting global stats:', error);
      return null;
    }
  }
  
  // Get leaderboard
  async getLeaderboard(
    type: 'installs' | 'rating' | 'trending' = 'installs',
    limit = 10
  ): Promise<LeaderboardEntry[]> {
    try {
      const params = new URLSearchParams({
        type,
        limit: limit.toString(),
      });
      
      const response = await fetch(`${this.vpUrl}/stats/leaderboard?${params}`);
      if (!response.ok) {
        return [];
      }
      
      const data: LeaderboardResponse = await response.json();
      return data.data;
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      return [];
    }
  }
  
  // Get trending servers
  async getTrendingServers(limit = 20): Promise<ExtendedServer[]> {
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
      });
      
      const response = await fetch(`${this.vpUrl}/stats/trending?${params}`);
      if (!response.ok) {
        return [];
      }
      
      const data: TrendingResponse = await response.json();
      return data.servers;
    } catch (error) {
      console.error('Error getting trending servers:', error);
      return [];
    }
  }
  
  // Search servers with stats
  async searchServersWithStats(query: string, source?: McpServerSource): Promise<ExtendedServer[]> {
    // For now, get all and filter client-side
    // TODO: Use search endpoint when available
    const allServers = await this.getAllServersWithStats(source);
    
    if (!query) return allServers;
    
    const searchQuery = query.toLowerCase();
    return allServers.filter(server => 
      server.name.toLowerCase().includes(searchQuery) ||
      server.description?.toLowerCase().includes(searchQuery) ||
      server.repository?.url?.toLowerCase().includes(searchQuery)
    );
  }
}

// Export a singleton instance
export const registryVPClient = new PluggedinRegistryVPClient();