'use client';

import { useCallback, useState } from 'react';

/**
 * Hook for managing loading states with error handling
 */
export function useLoading<T extends (...args: any[]) => Promise<any>>(
  asyncFunction: T,
  deps: React.DependencyList = []
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (...args: Parameters<T>): Promise<ReturnType<T> | undefined> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await asyncFunction(...args);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps
  );

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    execute,
    reset,
  };
}