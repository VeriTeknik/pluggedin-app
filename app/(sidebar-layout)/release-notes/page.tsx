'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react'; // Removed useEffect
import { useTranslation } from 'react-i18next';
import useSWR from 'swr'; 

// Removed import { updateReleaseNotesFromGitHub } from '@/app/actions/release-notes'; 
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { ReleaseNote } from '@/types/release';

// Import the created components
import { ReleaseCard } from './components/ReleaseCard';
import { ReleaseFilter } from './components/ReleaseFilter';
import { SearchBar } from './components/SearchBar';
// import { ReleaseTimeline } from './components/ReleaseTimeline'; // Optional timeline

const fetcher = async (url: string): Promise<ReleaseNote[]> => {
  const res = await fetch(url);
  return res.json();
};

export default function ReleaseNotesPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<'all' | 'pluggedin-app' | 'pluggedin-mcp'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const limit = 10; // Items per page

  // Construct API URL based on state
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('limit', limit.toString());
    if (filter !== 'all') {
      params.set('repository', filter);
    }
    if (searchTerm) {
      params.set('query', searchTerm);
      // Reset page to 1 when searching
      // Note: This might cause a double fetch if page state isn't managed carefully with search term
      // Consider using a debounced search term state
      // setPage(1); // This causes issues in render, manage page reset in search handler
    }
    return `/api/release-notes?${params.toString()}`;
  }, [filter, searchTerm, page, limit]);


  const { data: releaseNotes, error, isLoading, mutate: revalidateNotes } = useSWR(apiUrl, fetcher, {
    keepPreviousData: true, // Keep previous data while loading new page/filter
  });

  // Removed temporary useEffect trigger

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    setPage(1); // Reset page when search term changes
  };

  const handleFilterChange = (newFilter: 'all' | 'pluggedin-app' | 'pluggedin-mcp') => {
    setFilter(newFilter);
    setPage(1); // Reset page when filter changes
  };

  const handleNextPage = () => {
    // Add logic to check if there are more pages if possible
    setPage(prev => prev + 1);
  };

  const handlePrevPage = () => {
    setPage(prev => Math.max(1, prev - 1));
  };


  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">{t('releaseNotes.title', 'Release Notes')}</h1>

      {/* Filter and Search components */}
      <div className="mb-6 flex flex-col md:flex-row gap-4 items-center">
         <ReleaseFilter currentFilter={filter} onFilterChange={handleFilterChange} />
         <SearchBar onSearch={handleSearch} />
         {/* <p className="text-muted-foreground">(Filter/Search components placeholder)</p> */}
      </div>

      {/* Optional Timeline Visualization */}
      {/* <div className="mb-8"> */}
      {/*   <ReleaseTimeline releases={releaseNotes || []} /> */}
      {/* </div> */}

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
          <AlertDescription>{t('releaseNotes.errors.fetchFailed', 'Failed to load release notes.')}: {error.message}</AlertDescription>
        </Alert>
      )}

      {!isLoading && !error && (!releaseNotes || releaseNotes.length === 0) && (
         <Alert className="my-6">
           <AlertTitle>{searchTerm ? t('releaseNotes.noSearchResultsTitle', 'No Results Found') : t('releaseNotes.noReleasesTitle', 'No Release Notes Available')}</AlertTitle>
           <AlertDescription>{searchTerm ? t('releaseNotes.noSearchResultsText', 'No release notes match your search criteria.') : t('releaseNotes.noReleasesText', 'There are currently no release notes to display.')}</AlertDescription>
         </Alert>
      )}

      {!isLoading && !error && releaseNotes && releaseNotes.length > 0 && (
        <div className="space-y-6">
          {releaseNotes.map((note: ReleaseNote) => (
            <ReleaseCard key={`${note.repository}-${note.version}`} release={note} />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {!isLoading && !error && releaseNotes && (
         <div className="mt-8 flex justify-between items-center">
           <Button onClick={handlePrevPage} disabled={page <= 1}>
             {t('common.previous', 'Previous')}
           </Button>
           <span className="text-sm text-muted-foreground">
             {t('common.page', 'Page {{page}}', { page })}
           </span>
           {/* Disable next button if fewer results than limit were returned (simple check) */}
           <Button onClick={handleNextPage} disabled={releaseNotes.length < limit}>
             {t('common.next', 'Next')}
           </Button>
         </div>
       )}

       {/* TODO: Add RSS Feed Link */}
       <div className="mt-8 text-center">
          <a href="/api/release-notes/rss" target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
            {t('releaseNotes.rssFeed', 'Subscribe via RSS')}
          </a>
       </div>
    </div>
  );
}
