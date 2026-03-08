'use client';

import { useCallback, useState } from 'react';

import { getMemoryDetails, getMemoryTimeline, searchMemories } from '@/app/actions/memory';
import { useSafeSession } from '@/hooks/use-safe-session';
import type { RingType } from '@/lib/memory/types';

interface SearchResult {
  uuid: string;
  ringType: string;
  summary: string;
  relevanceScore: number;
  similarity: number;
  tags?: string[];
  decayStage: string;
  [key: string]: unknown;
}

export function useMemorySearch() {
  const { data: session } = useSafeSession();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (params: {
      query: string;
      ringTypes?: RingType[];
      agentUuid?: string;
      topK?: number;
      includeGut?: boolean;
    }) => {
      if (!session?.user?.id) {
        setError('Not authenticated');
        return;
      }

      setIsSearching(true);
      setError(null);

      try {
        const response = await searchMemories(params);
        if (response.success && response.data) {
          setResults(response.data as SearchResult[]);
        } else {
          setError(response.error || 'Search failed');
          setResults([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [session?.user?.id]
  );

  const fetchTimeline = useCallback(
    async (memoryUuids: string[]) => {
      if (!session?.user?.id) return null;

      try {
        const response = await getMemoryTimeline(memoryUuids);
        if (response.success) {
          return response.data;
        }
        return null;
      } catch {
        return null;
      }
    },
    [session?.user?.id]
  );

  const fetchDetails = useCallback(
    async (memoryUuids: string[]) => {
      if (!session?.user?.id) return null;

      try {
        const response = await getMemoryDetails(memoryUuids);
        if (response.success) {
          return response.data;
        }
        return null;
      } catch {
        return null;
      }
    },
    [session?.user?.id]
  );

  const clear = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return {
    results,
    isSearching,
    error,
    search,
    fetchTimeline,
    fetchDetails,
    clear,
  };
}
