import { useState, useCallback } from 'react';
import useSWR, { mutate } from 'swr';

export interface DocumentVersion {
  versionNumber: number;
  filePath: string;
  fileWritten: boolean;
  ragDocumentId?: string;
  createdAt: string;
  createdByModel?: {
    name: string;
    provider: string;
    version?: string;
  };
  changeSummary?: string;
  isCurrent: boolean;
}

export interface VersionListOptions {
  limit?: number;
  offset?: number;
  includeContent?: boolean;
}

// Fetcher for SWR
const fetcher = async (url: string) => {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch versions');
  }

  return response.json();
};

/**
 * Hook to fetch document versions
 */
export function useDocumentVersions(
  documentId: string | null,
  options?: VersionListOptions
) {
  const queryParams = new URLSearchParams();
  if (options?.limit) queryParams.append('limit', options.limit.toString());
  if (options?.offset) queryParams.append('offset', options.offset.toString());
  if (options?.includeContent) queryParams.append('includeContent', 'true');

  const url = documentId
    ? `/api/documents/${documentId}/versions${queryParams.toString() ? `?${queryParams}` : ''}`
    : null;

  const { data, error, isLoading, mutate: revalidate } = useSWR(
    url,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  ) as {
    data: { versions: DocumentVersion[] } | undefined;
    error: any;
    isLoading: boolean;
    mutate: any;
  };

  return {
    versions: data?.versions || [],
    isLoading,
    error,
    mutate: revalidate,
  };
}

/**
 * Hook to fetch specific version content
 */
export function useVersionContent(
  documentId: string | null,
  versionNumber: number | null
) {
  const url = documentId && versionNumber !== null
    ? `/api/documents/${documentId}/versions/${versionNumber}`
    : null;

  const { data, error, isLoading } = useSWR(
    url,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  ) as {
    data: { content: string; version: DocumentVersion } | undefined;
    error: any;
    isLoading: boolean;
  };

  return {
    content: data?.content,
    version: data?.version,
    isLoading,
    error,
  };
}

/**
 * Hook to restore a document version
 */
export function useRestoreVersion() {
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restoreVersion = useCallback(async (
    documentId: string,
    versionNumber: number,
    restoredByModel?: { name: string; provider: string; version?: string }
  ) => {
    setIsRestoring(true);
    setError(null);

    try {
      const response = await fetch(`/api/documents/${documentId}/versions/${versionNumber}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ restoredByModel }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to restore version');
      }

      const result = await response.json();

      // Revalidate both the document and its versions
      await mutate(`/api/documents/${documentId}`);
      await mutate(`/api/documents/${documentId}/versions`);

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to restore version';
      setError(errorMessage);
      throw err;
    } finally {
      setIsRestoring(false);
    }
  }, []);

  return {
    restoreVersion,
    isRestoring,
    error,
  };
}

/**
 * Hook to compare two versions
 */
export function useVersionComparison(
  documentId: string | null,
  version1: number | null,
  version2: number | null
) {
  const { content: content1, isLoading: isLoading1 } = useVersionContent(documentId, version1);
  const { content: content2, isLoading: isLoading2 } = useVersionContent(documentId, version2);

  return {
    content1,
    content2,
    isLoading: isLoading1 || isLoading2,
  };
}