'use client';

import { Share2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { shareCollection } from '@/app/actions/social';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

interface ShareCollectionDialogProps {
  collection: any; // The collection data
  profileUuid: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  children?: React.ReactNode;
}

export function ShareCollectionDialog({
  collection,
  profileUuid,
  variant = 'default',
  size = 'sm',
  children,
}: ShareCollectionDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(collection.name || '');
  const [description, setDescription] = useState(collection.description || '');
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleShare = async () => {
    if (!title.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a title for the shared collection',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await shareCollection(
        profileUuid,
        title,
        description,
        collection.content || collection, // Use the content or the whole collection
        isPublic
      );

      if (result.success) {
        toast({
          title: 'Success',
          description: 'Collection shared successfully',
        });
        setOpen(false);
        router.refresh();
      } else {
        throw new Error(result.error || 'Failed to share collection');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant={variant} size={size}>
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Collection</DialogTitle>
          <DialogDescription>
            Share this collection on your public profile
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title for the shared collection"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={3}
            />
          </div>
          <div className="flex items-center justify-between space-x-2">
            <Label htmlFor="isPublic" className="text-sm font-medium">
              Make public
            </Label>
            <Switch
              id="isPublic"
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {isPublic
              ? 'Anyone who visits your profile will be able to see this collection'
              : 'Only you will be able to see this collection on your profile'}
          </p>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleShare}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Sharing...' : 'Share Collection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 