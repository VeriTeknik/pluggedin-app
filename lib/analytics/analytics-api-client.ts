import { z } from 'zod';

// Analytics API configuration from environment
const ANALYTICS_API_URL = process.env.ANALYTICS_API_URL || 'https://analytics.plugged.in';
const ANALYTICS_API_USER = process.env.ANALYTICS_API_USERNAME || 'admin';
const ANALYTICS_API_PASS = process.env.ANALYTICS_API_PASSWORD || 'o6FdPN55UJLuP0';

// Response schemas
const RatingSchema = z.object({
  server_id: z.string(),
  user_id: z.string(),
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
  timestamp: z.string(),
});

const CommentSchema = z.object({
  id: z.string(),
  server_id: z.string(),
  user_id: z.string(),
  comment: z.string(),
  parent_id: z.string().optional(),
  timestamp: z.string(),
  updated_at: z.string().optional(),
  is_verified: z.boolean().optional(),
  helpful_count: z.number().optional(),
});

const ServerMetricsSchema = z.object({
  server_id: z.string(),
  server_name: z.string(),
  total_installs: z.number(),
  active_installs: z.number(),
  total_usage: z.number(),
  daily_active_users: z.number(),
  monthly_active_users: z.number(),
  average_rating: z.number(),
  rating_count: z.number(),
  comment_count: z.number(),
  last_updated: z.string(),
});

const TrendingServerSchema = z.object({
  server_id: z.string(),
  server_name: z.string(),
  description: z.string(),
  trending_score: z.number(),
  install_growth: z.number(),
  usage_growth: z.number(),
  recent_installs: z.number(),
});

const SearchResultSchema = z.object({
  servers: z.array(z.any()), // Define more specific schema if needed
  total_count: z.number(),
  took_ms: z.number(),
});

export type Rating = z.infer<typeof RatingSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type ServerMetrics = z.infer<typeof ServerMetricsSchema>;
export type TrendingServer = z.infer<typeof TrendingServerSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;

/**
 * Client for interacting with the Analytics API
 * Handles advanced features like comments, ratings, search, and metrics
 */
export class AnalyticsAPIClient {
  private readonly baseUrl: string;
  private readonly auth: string;

  constructor() {
    this.baseUrl = `${ANALYTICS_API_URL}/api/v1`;
    this.auth = Buffer.from(`${ANALYTICS_API_USER}:${ANALYTICS_API_PASS}`).toString('base64');
  }

  /**
   * Common fetch wrapper with auth headers
   */
  private async fetchWithAuth(url: string, options?: RequestInit): Promise<Response> {
    return fetch(url, {
      ...options,
      headers: {
        'Authorization': `Basic ${this.auth}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  }

  /**
   * Submit a comment for a server
   */
  async submitComment(
    serverId: string,
    userId: string,
    comment: string,
    parentId?: string
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.baseUrl}/servers/${serverId}/comment`,
        {
          method: 'POST',
          body: JSON.stringify({
            comment,
            parent_id: parentId,
          }),
          headers: {
            'X-User-ID': userId, // Analytics API uses header for user ID
          },
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: error || `Failed with status ${response.status}` };
      }

      const data = await response.json();
      return { success: true, id: data.id };
    } catch (error) {
      console.error('[Analytics API] Failed to submit comment:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get comments for a server
   */
  async getComments(
    serverId: string,
    limit = 20,
    offset = 0
  ): Promise<{ comments: Comment[]; total: number } | null> {
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      const response = await this.fetchWithAuth(
        `${this.baseUrl}/servers/${serverId}/comments?${params}`
      );

      if (!response.ok) {
        console.error('[Analytics API] Failed to get comments:', response.status);
        return null;
      }

      const data = await response.json();
      return {
        comments: data.comments || [],
        total: data.total || 0,
      };
    } catch (error) {
      console.error('[Analytics API] Failed to get comments:', error);
      return null;
    }
  }

  /**
   * Submit a rating for a server
   */
  async submitRating(
    serverId: string,
    userId: string,
    rating: number,
    comment?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.baseUrl}/servers/${serverId}/rate`,
        {
          method: 'POST',
          body: JSON.stringify({
            rating,
            comment,
          }),
          headers: {
            'X-User-ID': userId,
          },
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: error || `Failed with status ${response.status}` };
      }

      return { success: true };
    } catch (error) {
      console.error('[Analytics API] Failed to submit rating:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get ratings for a server
   */
  async getRatings(
    serverId: string,
    limit = 20,
    offset = 0
  ): Promise<{ ratings: Rating[]; total: number } | null> {
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      const response = await this.fetchWithAuth(
        `${this.baseUrl}/servers/${serverId}/ratings?${params}`
      );

      if (!response.ok) {
        console.error('[Analytics API] Failed to get ratings:', response.status);
        return null;
      }

      const data = await response.json();
      return {
        ratings: data.ratings || [],
        total: data.total || 0,
      };
    } catch (error) {
      console.error('[Analytics API] Failed to get ratings:', error);
      return null;
    }
  }

  /**
   * Get server statistics
   */
  async getServerStats(serverId: string): Promise<ServerMetrics | null> {
    try {
      const response = await this.fetchWithAuth(
        `${this.baseUrl}/servers/${serverId}/stats`
      );

      if (!response.ok) {
        console.error('[Analytics API] Failed to get server stats:', response.status);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('[Analytics API] Failed to get server stats:', error);
      return null;
    }
  }

  /**
   * Search servers
   */
  async searchServers(
    query: string,
    filters?: {
      categories?: string[];
      packageTypes?: string[];
      minRating?: number;
      sortBy?: string;
      offset?: number;
      limit?: number;
    }
  ): Promise<SearchResult | null> {
    try {
      const params = new URLSearchParams({
        q: query,
        ...(filters?.categories && { categories: filters.categories.join(',') }),
        ...(filters?.packageTypes && { package_types: filters.packageTypes.join(',') }),
        ...(filters?.minRating && { min_rating: filters.minRating.toString() }),
        ...(filters?.sortBy && { sort_by: filters.sortBy }),
        offset: (filters?.offset || 0).toString(),
        limit: (filters?.limit || 20).toString(),
      });

      const response = await this.fetchWithAuth(
        `${this.baseUrl}/search?${params}`
      );

      if (!response.ok) {
        console.error('[Analytics API] Failed to search servers:', response.status);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('[Analytics API] Failed to search servers:', error);
      return null;
    }
  }

  /**
   * Get trending servers
   */
  async getTrending(
    period = '24h',
    limit = 10
  ): Promise<TrendingServer[]> {
    try {
      const params = new URLSearchParams({
        period,
        limit: limit.toString(),
      });

      const response = await this.fetchWithAuth(
        `${this.baseUrl}/trending?${params}`
      );

      if (!response.ok) {
        console.error('[Analytics API] Failed to get trending:', response.status);
        return [];
      }

      const data = await response.json();
      return data.servers || [];
    } catch (error) {
      console.error('[Analytics API] Failed to get trending:', error);
      return [];
    }
  }

  /**
   * Get popular servers by category
   */
  async getPopular(
    category = 'all',
    limit = 10
  ): Promise<any[]> {
    try {
      const params = new URLSearchParams({
        category,
        limit: limit.toString(),
      });

      const response = await this.fetchWithAuth(
        `${this.baseUrl}/popular?${params}`
      );

      if (!response.ok) {
        console.error('[Analytics API] Failed to get popular:', response.status);
        return [];
      }

      const data = await response.json();
      return data.servers || [];
    } catch (error) {
      console.error('[Analytics API] Failed to get popular:', error);
      return [];
    }
  }

  /**
   * Get timeline data for a server
   */
  async getServerTimeline(
    serverId: string,
    period = '30d'
  ): Promise<any[] | null> {
    try {
      const params = new URLSearchParams({ period });

      const response = await this.fetchWithAuth(
        `${this.baseUrl}/servers/${serverId}/timeline?${params}`
      );

      if (!response.ok) {
        console.error('[Analytics API] Failed to get timeline:', response.status);
        return null;
      }

      const data = await response.json();
      return data.timeline || [];
    } catch (error) {
      console.error('[Analytics API] Failed to get timeline:', error);
      return null;
    }
  }
}

// Singleton instance
export const analyticsAPIClient = new AnalyticsAPIClient();