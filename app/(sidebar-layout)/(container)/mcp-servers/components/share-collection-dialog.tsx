import { AlertTriangle, Check, Share, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isServerShared, shareCollection } from '@/app/actions/social';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { McpServer } from '@/types/mcp-server';

interface ShareCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  servers: McpServer[];
  profileUuid: string;
  onSuccess?: () => void;
}

interface SharedServerInfo {
  uuid: string;
  template: any;
}

export function ShareCollectionDialog({
  open,
  onOpenChange,
  servers,
  profileUuid,
  onSuccess,
}: ShareCollectionDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sharedServers, setSharedServers] = useState<SharedServerInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSharedServers() {
      if (!open || !profileUuid) return;
      
      setIsLoading(true);
      try {
        const sharedInfo = await Promise.all(
          servers.map(async (server) => {
            const result = await isServerShared(profileUuid, server.uuid);
            if (result.isShared && result.server) {
              return {
                uuid: server.uuid,
                template: result.server.template
              };
            }
            return null;
          })
        );
        setSharedServers(sharedInfo.filter((info): info is SharedServerInfo => info !== null));
      } catch (error) {
        toast({
          title: t('common.error'),
          description: t('mcpServers.shareCollection.error.fetchSharedFailed'),
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchSharedServers();
  }, [open, profileUuid, servers]);

  const handleShare = async () => {
    if (!title.trim()) {
      toast({
        title: t('common.error'),
        description: t('mcpServers.shareCollection.error.titleRequired'),
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Create collection content with shared server templates
      const content = {
        servers: sharedServers.map(server => server.template)
      };

      const result = await shareCollection(
        profileUuid,
        title,
        description,
        content,
        isPublic
      );

      if (result.success) {
        toast({
          title: t('common.success'),
          description: t('mcpServers.shareCollection.success'),
        });
        onSuccess?.();
        onOpenChange(false);
      } else {
        throw new Error(result.error || t('mcpServers.shareCollection.error.shareFailed'));
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('mcpServers.shareCollection.error.shareFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const unsharedCount = servers.length - sharedServers.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('mcpServers.shareCollection.title')}</DialogTitle>
          <DialogDescription>
            {t('mcpServers.shareCollection.description', { count: sharedServers.length })}
          </DialogDescription>
        </DialogHeader>

        {unsharedCount > 0 && (
          <Alert variant="destructive" className="mt-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t('mcpServers.shareCollection.warning.unsharedServers')}</AlertTitle>
            <AlertDescription>
              {t('mcpServers.shareCollection.warning.unsharedServersDescription', { count: unsharedCount })}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t('mcpServers.shareCollection.form.servers')}</Label>
            <div className="space-y-2">
              {isLoading ? (
                Array.from({ length: servers.length }).map((_, i) => (
                  <div key={i} className="flex items-center space-x-2">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ))
              ) : (
                servers.map((server) => {
                  const isShared = sharedServers.some(s => s.uuid === server.uuid);
                  return (
                    <div key={server.uuid} className="flex items-center space-x-2">
                      {isShared ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <X className="h-4 w-4 text-red-500" />
                      )}
                      <span className={isShared ? 'text-green-700' : 'text-red-700'}>
                        {server.name}
                      </span>
                      {!isShared && (
                        <span className="text-sm text-gray-500">
                          ({t('mcpServers.shareCollection.notShared')})
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">{t('mcpServers.shareCollection.form.title')}</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('mcpServers.shareCollection.form.titlePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('mcpServers.shareCollection.form.description')}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('mcpServers.shareCollection.form.descriptionPlaceholder')}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="public"
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
            <Label htmlFor="public">{t('mcpServers.shareCollection.form.public')}</Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting || isLoading}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleShare}
            disabled={isSubmitting || isLoading || sharedServers.length === 0}
          >
            <Share className="mr-2 h-4 w-4" />
            {isSubmitting
              ? t('mcpServers.actions.shared')
              : t('mcpServers.actions.share')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 