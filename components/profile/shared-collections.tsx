import { ExternalLink, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { unshareCollection } from '@/app/actions/social';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { SharedCollection } from '@/types/social';

interface SharedCollectionsProps {
  collections: SharedCollection[];
  isLoading?: boolean;
  currentUserId?: string;
  onCollectionDeleted?: () => void;
}

export function SharedCollections({ collections, isLoading = false, currentUserId, onCollectionDeleted }: SharedCollectionsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [deletingCollection, setDeletingCollection] = useState<string | null>(null);

  const handleDelete = async (collection: SharedCollection) => {
    const isOwner = !!currentUserId && currentUserId === collection.profile?.project?.user?.id;
    if (!collection.profile_uuid || !isOwner) return;
    setDeletingCollection(collection.uuid);
    try {
      const result = await unshareCollection(collection.profile_uuid, collection.uuid);
      if (result.success) {
        toast({
          title: t('collections.deleteSuccess'),
          description: t('collections.deleteSuccessDesc'),
        });
        router.refresh();
        onCollectionDeleted?.();
      } else {
        throw new Error(result.error || t('collections.deleteError'));
      }
    } catch (error) {
      toast({
        title: t('collections.error'),
        description: error instanceof Error ? error.message : t('collections.deleteError'),
        variant: 'destructive',
      });
    } finally {
      setDeletingCollection(null);
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-6 bg-muted rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-muted rounded w-1/2"></div>
            </CardHeader>
            <CardContent>
              <div className="h-4 bg-muted rounded w-full mb-2"></div>
              <div className="h-4 bg-muted rounded w-4/5"></div>
            </CardContent>
            <CardFooter>
              <div className="h-10 bg-muted rounded w-28"></div>
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  if (collections.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground text-lg">No shared collections found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {collections.map((collection) => {
        const isOwner = !!currentUserId && currentUserId === collection.profile?.project?.user?.id;
        return (
          <Card key={collection.uuid} className="flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-lg">{collection.title}</CardTitle>
                {isOwner && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 w-8 p-0"
                        disabled={deletingCollection === collection.uuid}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('collections.deleteConfirmTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('collections.deleteConfirmDesc')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => handleDelete(collection)}
                          disabled={deletingCollection === collection.uuid}
                        >
                          {deletingCollection === collection.uuid ? t('common.deleting') : t('common.delete')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
              <CardDescription>
                {new Date(collection.created_at).toLocaleDateString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
              <p className="text-sm text-muted-foreground line-clamp-3">
                {collection.description || 'No description provided'}
              </p>
              <div className="mt-2">
                {collection.content && typeof collection.content === 'object' && (
                  <div className="rounded-md bg-muted p-2 mt-2">
                    <p className="text-xs text-muted-foreground">
                      {collection.content.servers?.length || 0} items in this collection
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/collections/${collection.uuid}?from=${encodeURIComponent(pathname)}`}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Collection
                </Link>
              </Button>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
} 