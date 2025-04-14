'use client';

import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { ReleaseNote } from '@/types/release';

import { ReleaseCard } from './components/ReleaseCard';
import { ReleaseFilter } from './components/ReleaseFilter';
import { SearchBar } from './components/SearchBar';

const fetcher = async (url: string): Promise<ReleaseNote[]> => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch release notes');
  }
  const data = await res.json();
  console.log('Fetched release notes:', data); // Debug log
  return data;
};

export default function ReleaseNotesPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<'all' | 'pluggedin-app' | 'pluggedin-mcp'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const limit = 10;

  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('limit', limit.toString());
    if (filter !== 'all') {
      params.set('repository', filter);
    }
    if (searchTerm) {
      params.set('query', searchTerm);
    }
    return `/api/release-notes?${params.toString()}`;
  }, [filter, searchTerm, page, limit]);

  const { data: releaseNotes, error, isLoading, mutate } = useSWR(apiUrl, fetcher, {
    keepPreviousData: true,
    onError: (err: Error) => {
      console.error('Error fetching release notes:', err);
    },
  });

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    setPage(1);
  };

  const handleFilterChange = (newFilter: 'all' | 'pluggedin-app' | 'pluggedin-mcp') => {
    setFilter(newFilter);
    setPage(1);
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      const response = await fetch('/api/release-notes', { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to refresh release notes');
      }
      
      await mutate();
    } catch (error) {
      console.error('Error refreshing release notes:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">{t('releaseNotes.title')}</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? t('common.loading') : t('releaseNotes.refresh')}
          </Button>
        </div>
        
        <p className="text-muted-foreground mb-8">{t('releaseNotes.description')}</p>

        <div className="mb-8 space-y-4 md:space-y-0 md:flex md:items-center md:justify-between">
          <div className="flex-grow">
            <ReleaseFilter currentFilter={filter} onFilterChange={handleFilterChange} />
          </div>
          <div className="w-full md:w-auto md:ml-4">
            <SearchBar onSearch={handleSearch} />
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">{t('common.loading')}</span>
          </div>
        )}

        {error && (
          <Alert variant="destructive" className="my-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t('common.error')}</AlertTitle>
            <AlertDescription>
              {t('releaseNotes.errors.fetchFailed')}: {error.message}
            </AlertDescription>
          </Alert>
        )}

        {!isLoading && !error && (!releaseNotes || releaseNotes.length === 0) && (
          <Alert className="my-6">
            <AlertTitle>
              {searchTerm ? t('releaseNotes.noSearchResultsTitle') : t('releaseNotes.noReleasesTitle')}
            </AlertTitle>
            <AlertDescription>
              {searchTerm ? t('releaseNotes.noSearchResultsText') : t('releaseNotes.noReleasesText')}
            </AlertDescription>
          </Alert>
        )}

        {!isLoading && !error && releaseNotes && releaseNotes.length > 0 && (
          <div className="space-y-6">
            {releaseNotes.map((note: ReleaseNote) => (
              <ReleaseCard key={`${note.repository}-${note.version}`} release={note} />
            ))}
          </div>
        )}

        {!isLoading && !error && releaseNotes && releaseNotes.length > 0 && (
          <div className="mt-8 flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0">
            <Button 
              onClick={() => setPage(prev => Math.max(1, prev - 1))} 
              disabled={page <= 1}
              className="w-full sm:w-auto"
            >
              {t('common.previous')}
            </Button>
            <span className="text-sm text-muted-foreground">
              {t('common.page', { page })}
            </span>
            <Button 
              onClick={() => setPage(prev => prev + 1)} 
              disabled={releaseNotes.length < limit}
              className="w-full sm:w-auto"
            >
              {t('common.next')}
            </Button>
          </div>
        )}

        <div className="mt-8 text-center">
          <a 
            href="/api/release-notes/rss" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            {t('releaseNotes.rssFeed')}
          </a>
        </div>
      </div>
    </div>
  );
}
