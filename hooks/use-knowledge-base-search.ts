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
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

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

    setIsLoading(true);
    setError(null);

    try {
      const result = await askKnowledgeBase(
        session.user.id,
        searchQuery,
        currentProject?.uuid
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
  }, [session?.user?.id, currentProject?.uuid]);

  // Debounce search
  useEffect(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    if (query.trim()) {
      const timer = setTimeout(() => {
        searchKnowledgeBase(query);
      }, 500); // 500ms debounce
      setDebounceTimer(timer);
    } else {
      setAnswer(null);
      setSources([]);
      setDocumentIds([]);
      setDocuments([]);
      setError(null);
    }

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [query]);

  const clearAnswer = useCallback(() => {
    setAnswer(null);
    setSources([]);
    setDocumentIds([]);
    setDocuments([]);
    setError(null);
    setQuery('');
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