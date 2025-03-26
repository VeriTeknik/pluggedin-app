'use client';

import { useTranslation } from 'react-i18next';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { Input } from '@/components/ui/input';
import type { PaginatedSearchResult } from '@/types/search';

import CardGrid from './components/CardGrid';
import { PaginationUi } from './components/PaginationUi';

const PAGE_SIZE = 6;

function SearchContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get('query') || '';
  const offset = parseInt(searchParams.get('offset') || '0');
  const [searchQuery, setSearchQuery] = useState(query);

  const { data, error } = useSWR<PaginatedSearchResult>(
    `/service/search?query=${encodeURIComponent(query)}&pageSize=${PAGE_SIZE}&offset=${offset}`,
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Failed to fetch: ${res.status} ${res.statusText} - ${errorText}`
        );
      }
      return res.json();
    }
  );

  if (error) console.error('Search error:', error);
  console.log('Search data:', data);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== query) {
        const params = new URLSearchParams();
        if (searchQuery) params.set('query', searchQuery);
        params.set('offset', '0');
        router.push(`/search?${params.toString()}`);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, query, router]);

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('offset', ((page - 1) * PAGE_SIZE).toString());
    router.push(`/search?${params.toString()}`);
  };

  return (
    <div className='container mx-auto py-8 space-y-6 flex flex-col items-center'>
      <h1 className='text-2xl font-bold'>
        {t('search.title')}
      </h1>
      <p className='text-muted-foreground text-center'>
        {t('search.subtitle')}
      </p>
      <Input
        type='search'
        placeholder={t('search.input.placeholder')}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className='max-w-xl mx-auto'
      />

      {data?.results && <CardGrid items={data.results} />}

      {data && (
        <PaginationUi
          currentPage={Math.floor(offset / PAGE_SIZE) + 1}
          totalPages={Math.ceil(data.total / PAGE_SIZE)}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}

export default function SearchPage() {
  const { t } = useTranslation();
  return (
    <Suspense fallback={<div>{t('search.loading')}</div>}>
      <SearchContent />
    </Suspense>
  );
}
