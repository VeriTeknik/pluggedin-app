/**
 * Visitor identification utilities for embedded chat
 */

// Generate a unique visitor ID
export function generateVisitorId(): string {
  return `visitor_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Get or create visitor ID from localStorage
export function getOrCreateVisitorId(): string {
  if (typeof window === 'undefined') {
    return generateVisitorId();
  }

  const VISITOR_ID_KEY = 'pluggedin_visitor_id';
  
  try {
    let visitorId = localStorage.getItem(VISITOR_ID_KEY);
    
    if (!visitorId) {
      visitorId = generateVisitorId();
      localStorage.setItem(VISITOR_ID_KEY, visitorId);
    }
    
    return visitorId;
  } catch (error) {
    // If localStorage is not available (e.g., incognito mode)
    console.warn('localStorage not available, using session visitor ID');
    return sessionStorage.getItem(VISITOR_ID_KEY) || generateVisitorId();
  }
}

// Get user info from parent window if available
export function getUserInfoFromParent(): { userId?: string; userName?: string; userEmail?: string } | null {
  if (typeof window === 'undefined' || window.parent === window) {
    return null;
  }

  try {
    // Try to get user info from parent window via postMessage
    // This would require the parent window to implement a response mechanism
    // For now, we'll return null and implement this later if needed
    return null;
  } catch (error) {
    console.error('Error getting user info from parent:', error);
    return null;
  }
}

// Check if visitor is authenticated by looking for auth cookies or tokens
export function checkAuthStatus(): { isAuthenticated: boolean; userId?: string } {
  if (typeof window === 'undefined') {
    return { isAuthenticated: false };
  }

  try {
    // Check for auth token in various places
    // This is a placeholder - actual implementation would depend on your auth setup
    const authToken = localStorage.getItem('auth_token') || 
                     sessionStorage.getItem('auth_token');
    
    if (authToken) {
      // In a real implementation, you'd decode the token to get user ID
      return { isAuthenticated: true };
    }
    
    return { isAuthenticated: false };
  } catch (error) {
    return { isAuthenticated: false };
  }
}

// Format visitor display name
export function formatVisitorName(visitorId: string, name?: string, email?: string): string {
  if (name) return name;
  if (email) return email.split('@')[0];
  
  // Create a friendly anonymous name from visitor ID
  const shortId = visitorId.split('_').pop()?.substring(0, 4) || '????';
  return `Guest ${shortId.toUpperCase()}`;
}

// Get visitor avatar initials
export function getVisitorInitials(visitorId: string, name?: string, email?: string): string {
  if (name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }
  if (email) {
    return email.substring(0, 2).toUpperCase();
  }
  
  // For anonymous users, use first 2 chars of short ID
  const shortId = visitorId.split('_').pop()?.substring(0, 2) || '??';
  return shortId.toUpperCase();
}

// Check if visitor appears to be authenticated
export function isAuthenticatedVisitor(visitorId: string, metadata?: any): boolean {
  // Check if visitor ID follows authenticated pattern (e.g., starts with "user_")
  if (visitorId.startsWith('user_')) return true;
  
  // Check metadata for auth indicators
  if (metadata?.isAuthenticated) return true;
  if (metadata?.userId) return true;
  
  return false;
}