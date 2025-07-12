import { oauthStateManager } from './OAuthStateManager';

/**
 * Clean up expired OAuth sessions
 * This should be called periodically (e.g., every hour) to remove expired sessions
 */
export async function cleanupExpiredOAuthSessions() {
  try {
    const deletedCount = await oauthStateManager.cleanupExpiredSessions();
    if (deletedCount > 0) {
      console.log(`[OAuth Cleanup] Deleted ${deletedCount} expired OAuth sessions`);
    }
  } catch (error) {
    console.error('[OAuth Cleanup] Failed to clean up expired sessions:', error);
  }
}

// Set up periodic cleanup (every hour)
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
  setInterval(cleanupExpiredOAuthSessions, 60 * 60 * 1000); // 1 hour
  
  // Also run cleanup on startup
  cleanupExpiredOAuthSessions();
}