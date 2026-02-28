'use client';

import useSWR from 'swr';

import { getMemorySessions, getZReports } from '@/app/actions/memory';
import { useSafeSession } from '@/hooks/use-safe-session';

interface UseMemorySessionsOptions {
  agentUuid?: string;
  limit?: number;
  offset?: number;
}

export function useMemorySessions(options?: UseMemorySessionsOptions) {
  const { data: session } = useSafeSession();

  const {
    data: response,
    error,
    mutate,
    isLoading,
  } = useSWR(
    session?.user?.id
      ? ['memory-sessions', session.user.id, options?.agentUuid, options?.limit, options?.offset]
      : null,
    async () => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }
      return await getMemorySessions(session.user.id, options);
    }
  );

  const sessions = response?.success && response.data ? (response.data as Array<Record<string, unknown>>) : [];

  return {
    sessions,
    isLoading,
    error: error || (response && !response.success ? response.error : null),
    refresh: mutate,
  };
}

export function useZReports(options?: { agentUuid?: string; limit?: number }) {
  const { data: session } = useSafeSession();

  const {
    data: response,
    error,
    mutate,
    isLoading,
  } = useSWR(
    session?.user?.id
      ? ['z-reports', session.user.id, options?.agentUuid, options?.limit]
      : null,
    async () => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }
      return await getZReports(session.user.id, options);
    }
  );

  const reports = response?.success && response.data ? (response.data as Array<Record<string, unknown>>) : [];

  return {
    reports,
    isLoading,
    error: error || (response && !response.success ? response.error : null),
    refresh: mutate,
  };
}
