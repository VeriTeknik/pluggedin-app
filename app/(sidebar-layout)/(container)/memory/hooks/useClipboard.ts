'use client';

import { useCallback, useMemo } from 'react';
import useSWR from 'swr';

import { type ClipboardEntry,deleteClipboardEntry, getClipboardEntries, setClipboardEntry } from '@/app/actions/clipboard';
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
    async () => getClipboardEntries()
  );

  const entries: ClipboardEntry[] = entriesResponse?.success ? entriesResponse.entries || [] : [];

  const setEntry = useCallback(
    async (options: {
      name?: string;
      idx?: number;
      value: string;
      contentType?: string;
      encoding?: 'utf-8' | 'base64' | 'hex';
      visibility?: 'private' | 'workspace' | 'public';
      createdByTool?: string;
      createdByModel?: string;
      ttlSeconds?: number;
    }) => {
      const result = await setClipboardEntry(options);

      if (result.success) {
        await mutate();
      } else {
        throw new Error(result.error || 'Failed to set clipboard entry');
      }

      return result.entry;
    },
    [mutate]
  );

  const deleteEntry = useCallback(
    async (options: { name?: string; idx?: number; clearAll?: boolean }) => {
      const result = await deleteClipboardEntry(options);

      if (result.success) {
        await mutate();
      } else {
        throw new Error(result.error || 'Failed to delete clipboard entry');
      }

      return result.success;
    },
    [mutate]
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
    setEntry,
    deleteEntry,
  };
}
