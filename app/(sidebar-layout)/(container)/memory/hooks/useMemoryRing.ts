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
    async () => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }
      return await getMemoryRing(session.user.id, options);
    }
  );

  const memories = response?.success && response.data ? (response.data as Array<Record<string, unknown>>) : [];

  const removeMemory = useCallback(
    async (memoryUuid: string) => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }

      const result = await deleteMemory(session.user.id, memoryUuid);
      if (result.success) {
        await mutate();
      } else {
        throw new Error(result.error || 'Failed to delete memory');
      }
    },
    [session?.user?.id, mutate]
  );

  return {
    memories,
    isLoading,
    error: error || (response && !response.success ? response.error : null),
    refresh: mutate,
    removeMemory,
  };
}
