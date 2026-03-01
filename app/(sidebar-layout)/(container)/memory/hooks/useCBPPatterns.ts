'use client';

import { useState, useCallback } from 'react';

import { queryCBPPatterns, submitCBPFeedback, getCBPStats } from '@/app/actions/memory';
import { useSafeSession } from '@/hooks/use-safe-session';

export interface CBPPattern {
  uuid: string;
  patternType: string;
  description: string;
  pattern: string;
  confidence: number;
  occurrenceCount: number;
  successRate: number;
  similarity: number;
  context: string;
  averageRating: number | null;
}

export interface CBPStats {
  totalPatterns: number;
  patternsAboveThreshold: number;
  totalContributions: number;
  uniqueContributors: number;
}

export function useCBPPatterns() {
  const { data: session } = useSafeSession();
  const [patterns, setPatterns] = useState<CBPPattern[]>([]);
  const [stats, setStats] = useState<CBPStats | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string) => {
    setIsSearching(true);
    setError(null);
    try {
      const result = await queryCBPPatterns(query);
      if (result.success && result.data) {
        setPatterns(result.data as CBPPattern[]);
      } else {
        setError(result.error || 'Failed to search patterns');
        setPatterns([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setPatterns([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const submitFeedback = useCallback(async (
    patternUuid: string,
    rating: number,
    feedbackType: string,
    comment?: string
  ) => {
    if (!session?.user?.id) return;
    try {
      await submitCBPFeedback(session.user.id, {
        patternUuid,
        rating,
        feedbackType,
        comment,
      });
    } catch {
      // Feedback submission is non-critical
    }
  }, [session?.user?.id]);

  const loadStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const result = await getCBPStats();
      if (result.success && result.data) {
        setStats(result.data as CBPStats);
      }
    } catch {
      // Stats loading is non-critical
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  const clear = useCallback(() => {
    setPatterns([]);
    setError(null);
  }, []);

  return {
    patterns,
    stats,
    isSearching,
    isLoadingStats,
    error,
    search,
    submitFeedback,
    loadStats,
    clear,
  };
}
