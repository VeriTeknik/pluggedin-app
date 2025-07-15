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
  user_id?: string;
  timestamp?: string;
  comment?: string;
}

export interface RatingResponse {
  success: boolean;
  stats?: ServerStats;
  feedback?: FeedbackItem;
  error?: string;
}

export interface FeedbackItem {
  id: string;
  server_id: string;
  source: McpServerSource;
  user_id: string;
  username?: string;
  user_avatar?: string;
  rating: number;
  comment?: string;
  created_at: string;
  updated_at: string;
  is_public: boolean;
}

export interface FeedbackResponse {
  feedback: FeedbackItem[];
  total_count: number;
  has_more: boolean;
}

export interface UserRatingResponse {
  has_rated: boolean;
  feedback?: FeedbackItem;
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
  
  constructor(baseUrl = process.env.REGISTRY_API_URL || 'https://registry.plugged.in/v0') {
    // Use the baseUrl directly for v0 API
    this.baseUrl = baseUrl;
    this.vpUrl = this.baseUrl; // VP endpoints are actually v0 endpoints
  }
  
  // Get servers with stats
  async getServersWithStats(
    limit = 30, 
    cursor?: string, 
    source?: McpServerSource,
    filters?: {
      registry_name?: string;
      sort?: string;
      search?: string;
    }
  ): Promise<ExtendedServersResponse> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (cursor) params.append('cursor', cursor);
    if (source) params.append('source', source);
    
    // Add new filtering parameters
    if (filters?.registry_name) params.append('registry_name', filters.registry_name);
    if (filters?.sort) params.append('sort', filters.sort);
    if (filters?.search) params.append('search', filters.search);
    
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
    
    const data = await response.json();
    // Handle both wrapped and unwrapped responses
    return data.server || data;
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
        // Only log non-404 errors since 404 is expected for community servers
        if (response.status !== 404) {
          console.error('Failed to track installation:', response.status);
        }
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
    source?: McpServerSource,
    userId?: string,
    comment?: string
  ): Promise<RatingResponse> {
    try {
      const requestBody = {
        rating,
        source: source || 'REGISTRY',
        user_id: userId,
        timestamp: new Date().toISOString(),
        comment
      };
      
      const response = await fetch(`${this.vpUrl}/servers/${serverId}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'PluggedIn-App/1.0',
        },
        body: JSON.stringify(requestBody),
      });
      
      const responseText = await response.text();
      
      if (!response.ok) {
        console.error('[Registry VP] Failed to submit rating:', {
          status: response.status,
          statusText: response.statusText,
          body: responseText
        });
        return { 
          success: false,
          error: `Registry error: ${response.status} - ${responseText || response.statusText}`
        };
      }
      
      // Try to parse as JSON, fallback to success if not JSON
      try {
        const data = JSON.parse(responseText);
        return { success: true, ...data };
      } catch (e) {
        // If response is not JSON, just return success
        return { success: true };
      }
    } catch (error) {
      console.error('[Registry VP] Error submitting rating:', error);
      return { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
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
  
  // Search servers with stats (now uses server-side filtering)
  async searchServersWithStats(query: string, source?: McpServerSource): Promise<ExtendedServer[]> {
    // Use the enhanced getServersWithStats with search parameter
    const response = await this.getServersWithStats(100, undefined, source, {
      search: query || undefined
    });
    
    return response.servers || [];
  }

  /**
   * Get feedback/reviews for a server
   */
  async getFeedback(
    serverId: string,
    limit = 20,
    offset = 0,
    sort: 'newest' | 'oldest' | 'rating_high' | 'rating_low' = 'newest'
  ): Promise<FeedbackResponse> {
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        sort,
      });

      const response = await fetch(`${this.vpUrl}/servers/${serverId}/feedback?${params}`, {
        headers: {
          'User-Agent': 'PluggedIn-App/1.0',
        },
      });

      if (!response.ok) {
        console.error('[Registry VP] Failed to get feedback:', response.status);
        return { feedback: [], total_count: 0, has_more: false };
      }

      return await response.json();
    } catch (error) {
      console.error('[Registry VP] Error getting feedback:', error);
      return { feedback: [], total_count: 0, has_more: false };
    }
  }

  /**
   * Check if a user has rated a server
   */
  async getUserRating(serverId: string, userId: string): Promise<UserRatingResponse> {
    try {
      const response = await fetch(`${this.vpUrl}/servers/${serverId}/rating/${userId}`, {
        headers: {
          'User-Agent': 'PluggedIn-App/1.0',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { has_rated: false };
        }
        console.error('[Registry VP] Failed to get user rating:', response.status);
        return { has_rated: false };
      }

      return await response.json();
    } catch (error) {
      console.error('[Registry VP] Error getting user rating:', error);
      return { has_rated: false };
    }
  }

  /**
   * Update user's feedback
   */
  async updateFeedback(
    serverId: string,
    feedbackId: string,
    rating: number,
    comment?: string,
    userId?: string
  ): Promise<RatingResponse> {
    try {
      const requestBody = {
        rating,
        comment,
        user_id: userId,
      };

      const response = await fetch(`${this.vpUrl}/servers/${serverId}/feedback/${feedbackId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'PluggedIn-App/1.0',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Registry VP] Failed to update feedback:', response.status, errorText);
        return { 
          success: false,
          error: `Failed to update feedback: ${response.status}`
        };
      }

      const data = await response.json();
      return { success: true, ...data };
    } catch (error) {
      console.error('[Registry VP] Error updating feedback:', error);
      return { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Delete user's feedback
   */
  async deleteFeedback(serverId: string, feedbackId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.vpUrl}/servers/${serverId}/feedback/${feedbackId}`, {
        method: 'DELETE',
        headers: {
          'User-Agent': 'PluggedIn-App/1.0',
        },
      });

      if (!response.ok) {
        console.error('[Registry VP] Failed to delete feedback:', response.status);
        return { 
          success: false,
          error: `Failed to delete feedback: ${response.status}`
        };
      }

      return { success: true };
    } catch (error) {
      console.error('[Registry VP] Error deleting feedback:', error);
      return { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Export a singleton instance
export const registryVPClient = new PluggedinRegistryVPClient();