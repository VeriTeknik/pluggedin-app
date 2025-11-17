'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

import { FALLBACK_METRICS } from '@/lib/constants/metrics';

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

  const fetchMetrics = () => {
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
          setMetrics(data);
          setIsLoading(false);
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
  };

  useEffect(() => {
    const cleanup = fetchMetrics();
    return cleanup;
  }, []);

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
