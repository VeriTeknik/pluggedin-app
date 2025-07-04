import { z } from 'zod';

// Analytics API configuration from environment
const ANALYTICS_API_URL = process.env.ANALYTICS_API_URL || 'https://analytics.plugged.in';
const ANALYTICS_API_USER = process.env.ANALYTICS_API_USERNAME || 'admin';
const ANALYTICS_API_PASS = process.env.ANALYTICS_API_PASSWORD || 'o6FdPN55UJLuP0';

// Event schemas
const BaseEventSchema = z.object({
  timestamp: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
});

const InstallEventSchema = BaseEventSchema.extend({
  type: z.literal('install'),
  serverId: z.string(),
  userId: z.string(),
  source: z.string(),
});

const UninstallEventSchema = BaseEventSchema.extend({
  type: z.literal('uninstall'),
  serverId: z.string(),
  userId: z.string(),
  reason: z.string().optional(),
});

const UsageEventSchema = BaseEventSchema.extend({
  type: z.literal('usage'),
  serverId: z.string(),
  userId: z.string(),
  toolName: z.string(),
  duration: z.number(),
  success: z.boolean().optional(),
});

const ViewEventSchema = BaseEventSchema.extend({
  type: z.literal('view'),
  serverId: z.string(),
  userId: z.string().optional(),
  source: z.enum(['search', 'detail', 'profile', 'discover']),
});

const ErrorEventSchema = BaseEventSchema.extend({
  type: z.literal('error'),
  serverId: z.string(),
  userId: z.string().optional(),
  error: z.string(),
  context: z.string(),
});

const RatingEventSchema = BaseEventSchema.extend({
  type: z.literal('rating'),
  serverId: z.string(),
  userId: z.string(),
  rating: z.number().min(1).max(5),
});

const ClaimEventSchema = BaseEventSchema.extend({
  type: z.literal('claim'),
  serverId: z.string(),
  userId: z.string(),
});

const ShareEventSchema = BaseEventSchema.extend({
  type: z.literal('share'),
  serverId: z.string(),
  userId: z.string(),
  visibility: z.enum(['public', 'private']),
});

const CommentEventSchema = BaseEventSchema.extend({
  type: z.literal('comment'),
  serverId: z.string(),
  userId: z.string(),
  comment: z.string(),
  parentId: z.string().optional(),
});

const AnalyticsEventSchema = z.discriminatedUnion('type', [
  InstallEventSchema,
  UninstallEventSchema,
  UsageEventSchema,
  ViewEventSchema,
  ErrorEventSchema,
  RatingEventSchema,
  ClaimEventSchema,
  ShareEventSchema,
  CommentEventSchema,
]);

export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;

// Queue for batching events
let eventQueue: AnalyticsEvent[] = [];
let flushTimeout: NodeJS.Timeout | null = null;

// Analytics service class
class AnalyticsService {
  private readonly baseUrl: string;
  private readonly auth: string;
  private readonly maxBatchSize = 50;
  private readonly flushInterval = 5000; // 5 seconds

  constructor() {
    this.baseUrl = ANALYTICS_API_URL;
    this.auth = Buffer.from(`${ANALYTICS_API_USER}:${ANALYTICS_API_PASS}`).toString('base64');
  }

  /**
   * Track an analytics event
   * @param event The event to track
   * @returns Promise that resolves when event is queued (non-blocking)
   */
  async track(event: AnalyticsEvent): Promise<void> {
    try {
      // Validate event
      const validatedEvent = AnalyticsEventSchema.parse(event);
      
      // Add timestamp if not provided
      if (!validatedEvent.timestamp) {
        validatedEvent.timestamp = new Date().toISOString();
      }

      // Add to queue
      eventQueue.push(validatedEvent);

      // Flush if batch size reached
      if (eventQueue.length >= this.maxBatchSize) {
        this.flush();
      } else {
        // Schedule flush if not already scheduled
        if (!flushTimeout) {
          flushTimeout = setTimeout(() => this.flush(), this.flushInterval);
        }
      }
    } catch (error) {
      console.error('[Analytics] Failed to track event:', error);
      // Don't throw - analytics should never break the app
    }
  }

  /**
   * Flush the event queue to the analytics API
   */
  private async flush(): Promise<void> {
    // Clear timeout
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }

    // Get events to send
    const eventsToSend = [...eventQueue];
    eventQueue = [];

    if (eventsToSend.length === 0) {
      return;
    }

    try {
      // Transform events to match analytics API format
      const transformedEvents = eventsToSend.map(event => {
        const baseEvent = {
          event_type: event.type,
          server_id: event.serverId,
          client_id: 'pluggedin-app', // Required field - identifies the source application
          session_id: event.metadata?.sessionId || `session-${Date.now()}`, // Generate if not provided
          user_id: event.userId || 'anonymous',
          metadata: {
            ...event.metadata,
            timestamp: event.timestamp,
          },
        };

        // Add type-specific fields to metadata
        switch (event.type) {
          case 'usage':
            baseEvent.metadata.toolName = (event as any).toolName;
            baseEvent.metadata.duration = (event as any).duration;
            baseEvent.metadata.success = (event as any).success;
            break;
          case 'install':
            baseEvent.metadata.source = (event as any).source;
            break;
          case 'view':
            baseEvent.metadata.viewSource = (event as any).source;
            break;
          case 'error':
            baseEvent.metadata.error = (event as any).error;
            baseEvent.metadata.context = (event as any).context;
            break;
          case 'rating':
            baseEvent.metadata.rating = (event as any).rating;
            break;
          case 'share':
            baseEvent.metadata.visibility = (event as any).visibility;
            break;
          case 'comment':
            baseEvent.metadata.comment = (event as any).comment;
            baseEvent.metadata.parentId = (event as any).parentId;
            break;
        }

        return baseEvent;
      });

      const response = await fetch(`${this.baseUrl}/api/events/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${this.auth}`,
        },
        body: JSON.stringify({
          events: transformedEvents,
        }),
      });

      if (!response.ok) {
        throw new Error(`Analytics API error: ${response.status}`);
      }

      console.log(`[Analytics] Successfully sent ${eventsToSend.length} events`);
    } catch (error) {
      console.error('[Analytics] Failed to send events:', error);
      // Optionally, re-queue failed events with backoff
      // For now, we'll just log and drop them to avoid memory issues
    }
  }

  /**
   * Get analytics metrics for a server
   */
  async getServerMetrics(serverId: string): Promise<{
    installations: number;
    views: number;
    usage: number;
    rating: number;
    ratingCount: number;
  } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/metrics/server/${serverId}`, {
        headers: {
          'Authorization': `Basic ${this.auth}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch metrics: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[Analytics] Failed to get server metrics:', error);
      return null;
    }
  }

  /**
   * Get trending servers based on recent activity
   */
  async getTrendingServers(limit = 10): Promise<Array<{
    serverId: string;
    score: number;
    installations: number;
    views: number;
  }>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/metrics/trending?limit=${limit}`, {
        headers: {
          'Authorization': `Basic ${this.auth}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch trending servers: ${response.status}`);
      }

      const data = await response.json();
      console.log('[Analytics] Trending servers response:', data);
      return data;
    } catch (error) {
      console.error('[Analytics] Failed to get trending servers:', error);
      return [];
    }
  }

  /**
   * Get global analytics metrics
   */
  async getGlobalMetrics(): Promise<{
    totalInstalls: number;
    totalViews: number;
    activeUsers: number;
    avgUsageTime: number;
    trends: {
      installs: { value: number; isPositive: boolean };
      views: { value: number; isPositive: boolean };
      users: { value: number; isPositive: boolean };
      usage: { value: number; isPositive: boolean };
    };
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/metrics/global`, {
        headers: {
          'Authorization': `Basic ${this.auth}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch global metrics: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[Analytics] Failed to get global metrics:', error);
      // Return default values on error
      throw error; // Let the caller handle with fallback
    }
  }

  /**
   * Force flush all pending events (useful for shutdown)
   */
  async forceFlush(): Promise<void> {
    await this.flush();
  }
}

// Singleton instance
export const analytics = new AnalyticsService();

// Helper functions for common tracking scenarios
export const trackInstall = (serverId: string, userId: string, source: string) => {
  return analytics.track({
    type: 'install',
    serverId,
    userId,
    source,
  });
};

export const trackUninstall = (serverId: string, userId: string, reason?: string) => {
  return analytics.track({
    type: 'uninstall',
    serverId,
    userId,
    reason,
  });
};

export const trackUsage = (serverId: string, userId: string, toolName: string, duration: number, success?: boolean) => {
  return analytics.track({
    type: 'usage',
    serverId,
    userId,
    toolName,
    duration,
    success,
  });
};

export const trackView = (serverId: string, source: 'search' | 'detail' | 'profile' | 'discover', userId?: string) => {
  return analytics.track({
    type: 'view',
    serverId,
    userId,
    source,
  });
};

export const trackError = (serverId: string, error: string, context: string, userId?: string) => {
  return analytics.track({
    type: 'error',
    serverId,
    userId,
    error,
    context,
  });
};

export const trackRating = (serverId: string, userId: string, rating: number) => {
  return analytics.track({
    type: 'rating',
    serverId,
    userId,
    rating,
  });
};

export const trackClaim = (serverId: string, userId: string) => {
  return analytics.track({
    type: 'claim',
    serverId,
    userId,
  });
};

export const trackShare = (serverId: string, userId: string, visibility: 'public' | 'private') => {
  return analytics.track({
    type: 'share',
    serverId,
    userId,
    visibility,
  });
};

export const trackComment = (serverId: string, userId: string, comment: string, parentId?: string) => {
  return analytics.track({
    type: 'comment',
    serverId,
    userId,
    comment,
    parentId,
  });
};