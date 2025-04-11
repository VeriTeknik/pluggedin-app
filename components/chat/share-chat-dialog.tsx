'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Share2 } from 'lucide-react';

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
import { shareEmbeddedChat } from '@/app/actions/social';

interface ShareChatDialogProps {
  chat: any; // The chat data
  profileUuid: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  children?: React.ReactNode;
}

export function ShareChatDialog({
  chat,
  profileUuid,
  variant = 'default',
  size = 'sm',
  children,
}: ShareChatDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(chat.title || '');
  const [description, setDescription] = useState(chat.description || '');
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleShare = async () => {
    if (!title.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a title for the shared chat',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const settings = {
        model: chat.model || 'claude-3-7-sonnet-20250219',
        temperature: chat.temperature || 0.7,
        maxTokens: chat.maxTokens || 1000,
        systemPrompt: chat.systemPrompt || '',
        ...chat.settings
      };

      const result = await shareEmbeddedChat(
        profileUuid,
        title,
        description,
        settings,
        isPublic
      );

      if (result.success) {
        toast({
          title: 'Success',
          description: 'Chat shared successfully',
        });
        setOpen(false);
        router.refresh();
      } else {
        throw new Error(result.error || 'Failed to share chat');
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
          <DialogTitle>Share Embedded Chat</DialogTitle>
          <DialogDescription>
            Share this chat on your public profile
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title for the shared chat"
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
              ? 'Anyone who visits your profile will be able to use this chat'
              : 'Only you will be able to see this chat on your profile'}
          </p>
          
          <div className="bg-amber-50 dark:bg-amber-950 p-2 rounded-md mt-2">
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Note: Others will be able to chat with your AI assistant, but won't see your past conversations.
            </p>
          </div>
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
            {isSubmitting ? 'Sharing...' : 'Share Chat'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 