'use client';

import { signIn as nextAuthSignIn } from 'next-auth/react';

import { safeLocalStorage } from '@/lib/storage-utils';

/**
 * Wrapper for signIn that tracks the last used SSO provider
 */
export function trackAndSignIn(provider: string) {
  // Store the provider and timestamp in localStorage (best-effort: sign-in must
  // still work when storage is blocked)
  safeLocalStorage.setJSON('last-used-sso', {
    provider,
    timestamp: Date.now(),
  });

  // Proceed with the sign in
  return nextAuthSignIn(provider, { redirect: true });
}