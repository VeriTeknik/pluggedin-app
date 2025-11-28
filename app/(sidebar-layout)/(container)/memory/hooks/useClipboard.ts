'use client';

import { useCallback, useMemo } from 'react';
import useSWR from 'swr';

import { deleteClipboardEntry, getClipboardEntries, type ClipboardEntry } from '@/app/actions/clipboard';
import { useSafeSession } from '@/hooks/use-safe-session';

export type { ClipboardEntry } from '@/app/actions/clipboard';

interface ClipboardStats {
  total: number;
  totalSize: number;
  expiringToday: number;
  contentTypes: number;
}

export function useClipboard() {
  const { data: session } = useSafeSession();

  const {
    data: entriesResponse,
    error,
    mutate,
    isLoading,
  } = useSWR(
    session?.user?.id ? ['clipboard', session.user.id] : null,
    async () => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }
      return await getClipboardEntries(session.user.id);
    }
  );

  const entries: ClipboardEntry[] = entriesResponse?.success ? entriesResponse.entries || [] : [];

  const deleteEntry = useCallback(
    async (options: { name?: string; idx?: number; clearAll?: boolean }) => {
      if (!session?.user?.id) {
        throw new Error('Not authenticated');
      }

      const result = await deleteClipboardEntry(session.user.id, options);

      if (result.success) {
        await mutate();
      } else {
        throw new Error(result.error || 'Failed to delete clipboard entry');
      }

      return result.success;
    },
    [session?.user?.id, mutate]
  );

  const stats = useMemo((): ClipboardStats => {
    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const expiringToday = entries.filter(entry => {
      if (!entry.expiresAt) return false;
      const expiry = new Date(entry.expiresAt);
      return expiry <= endOfDay && expiry >= now;
    }).length;

    const uniqueContentTypes = new Set(entries.map(e => e.contentType));

    return {
      total: entries.length,
      totalSize: entries.reduce((acc, entry) => acc + entry.sizeBytes, 0),
      expiringToday,
      contentTypes: uniqueContentTypes.size,
    };
  }, [entries]);

  return {
    entries,
    isLoading,
    error: error || (entriesResponse && !entriesResponse.success ? entriesResponse.error : null),
    stats,
    refresh: mutate,
    deleteEntry,
  };
}
