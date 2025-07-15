'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

/**
 * A safe wrapper around useSession that handles SSR properly
 * by ensuring session data is only accessed on the client side
 */
export function useSafeSession() {
  const [mounted, setMounted] = useState(false);
  const sessionResult = useSession();

  useEffect(() => {
    setMounted(true);
  }, []);

  // During SSR or before hydration, return safe defaults
  if (!mounted) {
    return {
      data: null,
      status: 'loading' as const,
      update: async () => null, // Provide a no-op update function
    };
  }

  // After hydration, return the actual session
  return sessionResult;
}