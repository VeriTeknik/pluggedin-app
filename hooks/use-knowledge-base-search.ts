import { useCallback, useEffect, useState } from 'react';

import { askKnowledgeBase } from '@/app/actions/library';

import { useProjects } from './use-projects';
import { useSafeSession } from './use-safe-session';

interface UseKnowledgeBaseSearchReturn {
  query: string;
  setQuery: (query: string) => void;
  answer: string | null;
  sources: string[];
  documentIds: string[];
  documents: Array<{
    id: string;
    name: string;
    relevance?: number;
    model?: {
      name: string;
      provider: string;
    };
    source?: string;
  }>;
  isLoading: boolean;
  error: string | null;
  searchKnowledgeBase: (query: string) => Promise<void>;
  clearAnswer: () => void;
}

export function useKnowledgeBaseSearch(): UseKnowledgeBaseSearchReturn {
  const { data: session } = useSafeSession();
  const { currentProject } = useProjects();

  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [documents, setDocuments] = useState<Array<{
    id: string;
    name: string;
    relevance?: number;
    model?: {
      name: string;
      provider: string;
    };
    source?: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Capture project UUID when query starts to ensure stable reference during search
  const [capturedProjectUuid, setCapturedProjectUuid] = useState<string | undefined>();

  // Update captured project UUID when query changes and project is available
  useEffect(() => {
    if (query.trim() && currentProject?.uuid) {
      setCapturedProjectUuid(currentProject.uuid);
    }
  }, [query, currentProject?.uuid]);

  const searchKnowledgeBase = useCallback(async (searchQuery: string) => {
    if (!session?.user?.id) {
      setError('Not authenticated');
      return;
    }

    if (!searchQuery.trim()) {
      setAnswer(null);
      setSources([]);
      setDocumentIds([]);
      setDocuments([]);
      setError(null);
      return;
    }

    // Use captured project UUID for stable reference, fall back to current if not captured yet
    const projectUuidToUse = capturedProjectUuid || currentProject?.uuid;

    setIsLoading(true);
    setError(null);

    try {
      const result = await askKnowledgeBase(
        session.user.id,
        searchQuery,
        projectUuidToUse
      );

      if (result.success && result.answer) {
        setAnswer(result.answer);
        setSources(result.sources || []);
        setDocumentIds(result.documentIds || []);
        setDocuments(result.documents || []);
      } else {
        setError(result.error || 'Failed to get answer');
        setAnswer(null);
        setSources([]);
        setDocumentIds([]);
        setDocuments([]);
      }
    } catch (err) {
      console.error('Knowledge base search error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      setAnswer(null);
      setSources([]);
      setDocumentIds([]);
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.id, capturedProjectUuid, currentProject?.uuid]);

  // Debounce search
  useEffect(() => {
    if (!query.trim()) {
      setAnswer(null);
      setSources([]);
      setDocumentIds([]);
      setDocuments([]);
      setError(null);
      return;
    }

    const timer = setTimeout(() => {
      searchKnowledgeBase(query);
    }, 500); // 500ms debounce

    return () => {
      clearTimeout(timer);
    };
  }, [query, searchKnowledgeBase]);

  const clearAnswer = useCallback(() => {
    setAnswer(null);
    setSources([]);
    setDocumentIds([]);
    setDocuments([]);
    setError(null);
    setQuery('');
    setCapturedProjectUuid(undefined);
  }, []);

  return {
    query,
    setQuery,
    answer,
    sources,
    documentIds,
    documents,
    isLoading,
    error,
    searchKnowledgeBase,
    clearAnswer,
  };
}