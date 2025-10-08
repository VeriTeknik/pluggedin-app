import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { profilesTable, projectsTable } from '@/db/schema';
import { analyticsCache, getCacheKey } from '@/lib/analytics-cache';
import { getAuthSession } from '@/lib/auth';
import { rateLimiter } from '@/lib/rate-limiter';

/**
 * Higher-order function for analytics endpoints
 * Centralizes authentication, rate limiting, validation, and error handling
 */

// Type definitions
type ParamsParser<Args extends any[], P> = (...args: Args) => P;
type Handler<P, R> = (params: P, userId: string) => Promise<R>;

interface AnalyticsResult<R> {
  success: boolean;
  data?: R;
  error?: string;
}

// Shared profile ownership verification
export async function verifyProfileOwnership(
  profileUuid: string,
  userId: string
): Promise<boolean> {
  const profile = await db
    .select({ uuid: profilesTable.uuid })
    .from(profilesTable)
    .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
    .where(and(eq(profilesTable.uuid, profileUuid), eq(projectsTable.user_id, userId)))
    .limit(1);

  return profile.length > 0;
}

/**
 * Creates an analytics endpoint with built-in auth, rate limiting, caching, and error handling
 *
 * @param parse - Function to parse and validate input parameters
 * @param rateKey - Function to generate rate limit key based on user ID
 * @param handler - The actual business logic handler
 * @param options - Additional options for the endpoint
 */
export function withAnalytics<Args extends any[], P, R>(
  parse: ParamsParser<Args, P>,
  rateKey: (userId: string) => string,
  handler: Handler<P, R>,
  options: {
    skipProfileOwnership?: boolean;
    rateLimit?: { requests: number; window: number };
    cache?: {
      enabled: boolean;
      ttl?: number;
      keyGenerator?: (params: P) => string;
    };
  } = {}
) {
  return async (...args: Args): Promise<AnalyticsResult<R>> => {
    try {
      // 1. Parse and validate inputs
      const params = parse(...args);

      // 2. Check authentication
      const session = await getAuthSession();
      if (!session?.user?.id) {
        return { success: false, error: 'Unauthorized' };
      }
      const userId = session.user.id;

      // 3. Apply rate limiting first (before expensive operations)
      const { requests = 30, window = 60 } = options.rateLimit || {};
      const rateLimitKey = rateKey(userId);
      const rateLimit = await rateLimiter.check(rateLimitKey, requests, window);
      if (!rateLimit.success) {
        return { success: false, error: 'Rate limit exceeded. Please try again later.' };
      }

      // 4. Verify profile ownership (unless skipped) - MUST happen before cache check
      let profileUuid: string | undefined;
      if (!options.skipProfileOwnership) {
        // Type-safe profile UUID extraction
        if (!params || typeof params !== 'object' || !('profileUuid' in params)) {
          return { success: false, error: 'Profile UUID is required' };
        }
        profileUuid = (params as { profileUuid: string }).profileUuid;
        if (!profileUuid || typeof profileUuid !== 'string') {
          return { success: false, error: 'Invalid profile UUID format' };
        }
        const hasAccess = await verifyProfileOwnership(profileUuid, userId);
        if (!hasAccess) {
          return { success: false, error: 'Profile not found or unauthorized' };
        }
      }

      // 5. Check cache if enabled (AFTER ownership verification for security)
      let cacheKey: string | undefined;
      if (options.cache?.enabled) {
        if (options.cache.keyGenerator) {
          cacheKey = options.cache.keyGenerator(params);
        } else if (params && typeof params === 'object') {
          const paramsObj = params as Record<string, unknown>;
          const profileUuidValue = typeof paramsObj.profileUuid === 'string' ? paramsObj.profileUuid : undefined;

          if (profileUuidValue) {
            const serializedParams = Object.entries(paramsObj)
              .filter(([key]) => key !== 'profileUuid')
              .filter(([, value]) => value !== undefined)
              .map(([key, value]) => {
                if (value === null) {
                  return `${key}=null`;
                }
                if (typeof value === 'object') {
                  return `${key}=${encodeURIComponent(JSON.stringify(value))}`;
                }
                return `${key}=${encodeURIComponent(String(value))}`;
              })
              .sort()
              .join('&') || 'default';

            cacheKey = getCacheKey(
              handler.name || 'analytics',
              userId,
              profileUuidValue,
              serializedParams
            );
          }
        }

        if (cacheKey) {
          const cachedData = analyticsCache.get<R>(cacheKey);
          if (cachedData !== null) {
            return { success: true, data: cachedData };
          }
        }
      }

      // 6. Execute the handler
      const data = await handler(params, userId);

      // 7. Store in cache if enabled
      if (options.cache?.enabled && cacheKey) {
        analyticsCache.set(cacheKey, data, options.cache.ttl);
      }

      return { success: true, data };

    } catch (error) {
      // 6. Handle errors uniformly
      console.error('Analytics error:', error);

      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: `Invalid input: ${error.errors[0].message}`
        };
      }

      return {
        success: false,
        error: 'Failed to fetch analytics data. Please try again later.'
      };
    }
  };
}

// Common Zod schemas for reuse
export const analyticsSchemas = {
  uuid: z.string().uuid('Invalid UUID'),
  profileUuid: z.string().uuid('Invalid profile UUID'),
  serverUuid: z.string().uuid('Invalid server UUID'),
  period: z.enum(['7d', '30d', '90d', 'all']),
  limit: z.number().int().min(1).max(100),
};

// Type exports for analytics data
export type TimePeriod = z.infer<typeof analyticsSchemas.period>;
