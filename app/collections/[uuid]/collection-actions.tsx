'use client';

import { Copy, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
import { useToast } from '@/hooks/use-toast';
import { SharedCollection } from '@/types/social';

interface CollectionActionsProps {
  collection: SharedCollection;
}

export function CollectionActions({ collection }: CollectionActionsProps) {
  const router = useRouter();
  const { toast } = useToast();

  const handleDelete = async () => {
    if (!collection.profile_uuid) return;
    
    try {
      const result = await unshareCollection(collection.profile_uuid, collection.uuid);
      if (result.success) {
        router.push('/discover');
      } else {
        throw new Error(result.error || 'Failed to delete collection');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete collection',
        variant: 'destructive',
      });
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({
        title: 'Success',
        description: 'Collection URL copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy URL to clipboard',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleCopy}>
        <Copy className="mr-2 h-4 w-4" />
        Copy Link
      </Button>

      <div className="flex gap-2">
        <Button variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Add to Current Workspace
        </Button>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create as New Workspace
        </Button>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Collection
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this collection.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 