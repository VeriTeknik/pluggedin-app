import { useCallback } from 'react';

/**
 * @deprecated Analytics tracking is now done server-side only through MCP activity notifications
 * This hook is kept for backward compatibility but does nothing
 */
export function useAnalytics() {
  const track = useCallback(async (event: {
    type: 'view' | 'install' | 'uninstall' | 'rating' | 'claim' | 'share';
    serverId: string;
    source?: string;
    rating?: number;
    visibility?: 'public' | 'private';
    reason?: string;
  }) => {
    // No-op: Analytics tracking is now done server-side only
    // This function is kept for backward compatibility
    console.debug('[Analytics] Client-side tracking is deprecated. Events are tracked server-side.');
  }, []);

  return { track };
}