'use client';

import { signIn as nextAuthSignIn } from 'next-auth/react';

/**
 * Wrapper for signIn that tracks the last used SSO provider
 */
export function trackAndSignIn(provider: string) {
  // Store the provider and timestamp in localStorage
  localStorage.setItem('last-used-sso', JSON.stringify({
    provider,
    timestamp: Date.now(),
  }));
  
  // Proceed with the sign in
  return nextAuthSignIn(provider, { redirect: true });
}