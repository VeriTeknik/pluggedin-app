'use client';

import { useCallback } from 'react';
import useSWR from 'swr';

import { deleteMemory, getMemoryRing } from '@/app/actions/memory';
import { useSafeSession } from '@/hooks/use-safe-session';
import type { RingType } from '@/lib/memory/types';

interface UseMemoryRingOptions {
  ringType?: RingType;
  agentUuid?: string;
  limit?: number;
  offset?: number;
}

/** Shape of a memory ring entry as returned by the Drizzle query */
export interface MemoryRingEntry {
  uuid: string;
  ring_type: string;
  content_summary: string | null;
  content_essence: string | null;
  content_full: string | null;
  content_compressed: string | null;
  current_decay_stage: string;
  current_token_count: number;
  access_count: number;
  relevance_score: number;
  success_score: number | null;
  reinforcement_count: number;
  is_shock: boolean;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
}

export function useMemoryRing(options?: UseMemoryRingOptions) {
  const { data: session } = useSafeSession();

  const {
    data: response,
    error,
    mutate,
    isLoading,
  } = useSWR(
    session?.user?.id
      ? ['memory-ring', session.user.id, options?.ringType, options?.agentUuid, options?.limit, options?.offset]
      : null,
    async () => getMemoryRing(options)
  );

  const memories: MemoryRingEntry[] = response?.success && response.data
    ? (response.data as MemoryRingEntry[])
    : [];

  const removeMemory = useCallback(
    async (memoryUuid: string) => {
      const result = await deleteMemory(memoryUuid);
      if (result.success) {
        await mutate();
      } else {
        throw new Error(result.error || 'Failed to delete memory');
      }
    },
    [mutate]
  );

  return {
    memories,
    isLoading,
    error: error || (response && !response.success ? response.error : null),
    refresh: mutate,
    removeMemory,
  };
}
