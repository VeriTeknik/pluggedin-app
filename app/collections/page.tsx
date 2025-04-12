'use client';

import { Download } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { Button } from '@/components/ui/button';
import { SharedCollection } from '@/types/social';

import { CollectionCardGrid } from './components/collection-card-grid';
import { ImportCollectionsDialog } from './components/import-collections-dialog';

export default function CollectionsPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Fetch collections
  const { data: collections, error, isLoading } = useSWR<SharedCollection[]>(
    '/api/collections',
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch collections');
      }
      return response.json();
    }
  );

  const handleSelectionChange = (selectedIds: string[]) => {
    setSelectedCollections(selectedIds);
  };

  const handleImportSuccess = () => {
    // Clear selection after successful import
    setSelectedCollections([]);
  };

  const selectedCollectionObjects = collections?.filter(c => 
    selectedCollections.includes(c.uuid)
  ) ?? [];

  return (
    <div className="container py-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">{t('collections.title')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('collections.description')}
          </p>
        </div>
        {selectedCollections.length > 0 && (
          <Button
            onClick={() => setImportDialogOpen(true)}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            {t('collections.import.button', { count: selectedCollections.length })}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-8">
          {t('common.loading')}...
        </div>
      ) : error ? (
        <div className="text-center py-8 text-destructive">
          {t('collections.error.loadFailed')}
        </div>
      ) : collections?.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {t('collections.empty')}
        </div>
      ) : (
        <CollectionCardGrid
          collections={collections ?? []}
          selectedIds={selectedCollections}
          onSelectionChange={handleSelectionChange}
        />
      )}

      <ImportCollectionsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        selectedCollections={selectedCollectionObjects}
        onSuccess={handleImportSuccess}
      />
    </div>
  );
} 