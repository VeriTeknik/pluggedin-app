import { RateLimiterMemory } from 'rate-limiter-flexible';

// Create rate limiters for different admin actions
const adminGeneralLimiter = new RateLimiterMemory({
  points: 100, // Number of requests
  duration: 60, // Per minute
  keyPrefix: 'admin_general',
});

const adminEmailLimiter = new RateLimiterMemory({
  points: 10, // Number of email campaigns
  duration: 3600, // Per hour
  keyPrefix: 'admin_email',
});

const adminBulkOperationLimiter = new RateLimiterMemory({
  points: 5, // Number of bulk operations
  duration: 3600, // Per hour
  keyPrefix: 'admin_bulk',
});

const adminSensitiveLimiter = new RateLimiterMemory({
  points: 20, // Number of sensitive operations (role changes, deletions)
  duration: 3600, // Per hour
  keyPrefix: 'admin_sensitive',
});

export type AdminRateLimitType = 'general' | 'email' | 'bulk' | 'sensitive';

/**
 * Check rate limit for admin actions
 * @param adminId - The admin user ID
 * @param type - The type of admin action
 * @returns Promise that resolves if within limits, rejects with retry time if exceeded
 */
export async function checkAdminRateLimit(
  adminId: string,
  type: AdminRateLimitType = 'general'
): Promise<void> {
  const limiter = {
    general: adminGeneralLimiter,
    email: adminEmailLimiter,
    bulk: adminBulkOperationLimiter,
    sensitive: adminSensitiveLimiter,
  }[type];

  try {
    await limiter.consume(adminId);
  } catch (rateLimiterRes: any) {
    const retryAfter = Math.round(rateLimiterRes?.msBeforeNext / 1000) || 60;
    throw new Error(`Rate limit exceeded. Please try again in ${retryAfter} seconds.`);
  }
}

/**
 * Get remaining points for an admin action type
 */
export async function getAdminRateLimitStatus(
  adminId: string,
  type: AdminRateLimitType = 'general'
): Promise<{
  remainingPoints: number;
  totalPoints: number;
  resetTime: Date;
}> {
  const limiter = {
    general: adminGeneralLimiter,
    email: adminEmailLimiter,
    bulk: adminBulkOperationLimiter,
    sensitive: adminSensitiveLimiter,
  }[type];

  try {
    const res = await limiter.get(adminId);
    const remainingPoints = limiter.points - (res?.consumedPoints || 0);
    const resetTime = new Date(Date.now() + limiter.duration * 1000);

    return {
      remainingPoints,
      totalPoints: limiter.points,
      resetTime,
    };
  } catch (error) {
    return {
      remainingPoints: limiter.points,
      totalPoints: limiter.points,
      resetTime: new Date(Date.now() + limiter.duration * 1000),
    };
  }
}

/**
 * Reset rate limit for an admin (for emergency use)
 */
export async function resetAdminRateLimit(
  adminId: string,
  type?: AdminRateLimitType
): Promise<void> {
  if (type) {
    const limiter = {
      general: adminGeneralLimiter,
      email: adminEmailLimiter,
      bulk: adminBulkOperationLimiter,
      sensitive: adminSensitiveLimiter,
    }[type];
    await limiter.delete(adminId);
  } else {
    // Reset all limiters for the admin
    await Promise.all([
      adminGeneralLimiter.delete(adminId),
      adminEmailLimiter.delete(adminId),
      adminBulkOperationLimiter.delete(adminId),
      adminSensitiveLimiter.delete(adminId),
    ]);
  }
}