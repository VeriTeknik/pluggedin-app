'use client';

import useSWR from 'swr';

import { getMemoryStats } from '@/app/actions/memory';
import { useSafeSession } from '@/hooks/use-safe-session';
import type { MemoryStats } from '@/lib/memory/types';

export function useMemoryStats() {
  const { data: session } = useSafeSession();

  const {
    data: response,
    error,
    mutate,
    isLoading,
  } = useSWR(
    session?.user?.id ? ['memory-stats', session.user.id] : null,
    async () => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }
      return await getMemoryStats(session.user.id);
    },
    { refreshInterval: 30000 }
  );

  const stats: MemoryStats = response?.success && response.data
    ? response.data as MemoryStats
    : {
        totalSessions: 0,
        activeSessions: 0,
        totalFreshMemories: 0,
        unclassifiedCount: 0,
        ringCounts: {} as Record<string, number>,
        decayStageCounts: {} as Record<string, number>,
        totalGutPatterns: 0,
      };

  return {
    stats,
    isLoading,
    error: error || (response && !response.success ? response.error : null),
    refresh: mutate,
  };
}
