'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { z } from 'zod';

import { FALLBACK_METRICS } from '@/lib/constants/metrics';

// Zod schema for validating API response
const PlatformMetricsSchema = z.object({
  totalUsers: z.number().int().nonnegative(),
  totalProjects: z.number().int().nonnegative(),
  totalServers: z.number().int().nonnegative(),
  newProfiles30d: z.number().int().nonnegative(),
  newUsers30d: z.number().int().nonnegative(),
});

export interface PlatformMetrics {
  totalUsers: number;
  totalProjects: number;
  totalServers: number;
  newProfiles30d: number;
  newUsers30d: number;
}

interface MetricsContextValue {
  metrics: PlatformMetrics;
  isLoading: boolean;
  hasError: boolean;
  refetch: () => void;
}

const MetricsContext = createContext<MetricsContextValue | undefined>(undefined);

/**
 * Provides platform metrics to all child components with caching
 * Fetches metrics once and shares across all consumers
 */
export function MetricsProvider({ children }: { children: ReactNode }) {
  const [metrics, setMetrics] = useState<PlatformMetrics>({
    totalUsers: FALLBACK_METRICS.totalUsers,
    totalProjects: FALLBACK_METRICS.totalProjects,
    totalServers: FALLBACK_METRICS.totalServers,
    newProfiles30d: FALLBACK_METRICS.newProfiles30d,
    newUsers30d: FALLBACK_METRICS.newUsers30d,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const fetchMetrics = useCallback(() => {
    const abortController = new AbortController();

    setIsLoading(true);
    setHasError(false);

    fetch('/api/platform-metrics', { signal: abortController.signal })
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        if (!abortController.signal.aborted) {
          // Validate response with Zod schema
          const validationResult = PlatformMetricsSchema.safeParse(data);

          if (validationResult.success) {
            setMetrics(validationResult.data);
            setIsLoading(false);
          } else {
            // Invalid data structure, use fallback
            throw new Error(`Invalid metrics data: ${validationResult.error.message}`);
          }
        }
      })
      .catch(err => {
        // Ignore abort errors
        if (err.name === 'AbortError') return;

        if (!abortController.signal.aborted) {
          setHasError(true);
          setIsLoading(false);
          // Only log in development
          if (process.env.NODE_ENV === 'development') {
            console.warn('Failed to fetch platform metrics, using fallback values:', err);
          }
        }
      });

    return () => abortController.abort();
  }, []); // Empty deps - function is stable and doesn't depend on external values

  useEffect(() => {
    const cleanup = fetchMetrics();
    return cleanup;
  }, [fetchMetrics]); // Now includes fetchMetrics in dependency array

  return (
    <MetricsContext.Provider value={{ metrics, isLoading, hasError, refetch: fetchMetrics }}>
      {children}
    </MetricsContext.Provider>
  );
}

/**
 * Hook to access platform metrics
 * Must be used within a MetricsProvider
 */
export function useMetrics() {
  const context = useContext(MetricsContext);

  if (context === undefined) {
    throw new Error('useMetrics must be used within a MetricsProvider');
  }

  return context;
}
