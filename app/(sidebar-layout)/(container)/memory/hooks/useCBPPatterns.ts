'use client';

import { useState, useCallback } from 'react';

import { queryCBPPatterns, submitCBPFeedback, getCBPStats } from '@/app/actions/memory';

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
    try {
      await submitCBPFeedback({
        patternUuid,
        rating,
        feedbackType,
        comment,
      });
    } catch (err) {
      console.error('Failed to submit CBP feedback:', err);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const result = await getCBPStats();
      if (result.success && result.data) {
        setStats(result.data as CBPStats);
      }
    } catch (err) {
      console.error('Failed to load CBP stats:', err);
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
