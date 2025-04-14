'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';

interface Collection {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

function CollectionsContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const query = searchParams.get('q') || '';

  const { data: collections, error, isLoading } = useSWR(
    `/api/collections${query ? `?q=${encodeURIComponent(query)}` : ''}`,
    async (url: string): Promise<Collection[]> => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch collections');
      return res.json();
    }
  );

  const handleSearch = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set('q', value);
    } else {
      params.delete('q');
    }
    router.push(`/collections?${params.toString()}`);
  };

  const handleCreateCollection = () => {
    router.push('/collections/new');
  };

  return (
    <div className="container py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">{t('collections.title')}</h1>
          <Button onClick={handleCreateCollection}>
            {t('collections.create')}
          </Button>
        </div>

        <Input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={t('collections.searchPlaceholder')}
        />

        {isLoading && <div>{t('common.loading')}</div>}
        {error && <div className="text-red-500">{t('common.error')}</div>}
        {collections?.length === 0 && (
          <div>{t('collections.noResults')}</div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {collections?.map((collection: Collection) => (
            <Card
              key={collection.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => router.push(`/collections/${collection.id}`)}
            >
              <CardHeader>
                <CardTitle>{collection.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {collection.description}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(collection.createdAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CollectionsPage() {
  return (
    <Suspense fallback={<div className="container py-8">Loading...</div>}>
      <CollectionsContent />
    </Suspense>
  );
} 