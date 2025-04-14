'use client';

import { Copy, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import {
  createApiKey,
  deleteApiKey,
  getApiKeys,
} from '@/app/actions/api-keys';
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
import { useProjects } from '@/hooks/use-projects';
import { useToast } from '@/hooks/use-toast';
import { ApiKey } from '@/types/api-key';

export default function ApiKeysPage() {
  const { currentProject } = useProjects();
  const {
    data: apiKeys,
    error,
    isLoading,
    mutate,
  } = useSWR(
    currentProject?.uuid ? `${currentProject?.uuid}/api-keys` : null,
    () => getApiKeys(currentProject?.uuid || '')
  );
  const [revealed, setRevealed] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<ApiKey | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const copyApiKey = async (apiKey: string) => {
    await navigator.clipboard.writeText(apiKey);
    toast({
      title: t('apiKeys.toast.copied.title'),
      description: t('apiKeys.toast.copied.description'),
    });
  };

  const toggleReveal = () => {
    setRevealed(!revealed);
  };

  const maskApiKey = (key: string) => {
    return `${key.slice(0, 5)}${'•'.repeat(key.length - 5)}`;
  };

  const handleCreateApiKey = async () => {
    try {
      if (!currentProject?.uuid) {
        return;
      }
      setIsCreating(true);
      await createApiKey(currentProject.uuid, newKeyName);
      await mutate();
      setIsCreateDialogOpen(false);
      setNewKeyName('');
      toast({
        title: t('apiKeys.toast.created.title'),
        description: t('apiKeys.toast.created.description'),
      });
    } catch (error) {
      toast({
        title: t('apiKeys.toast.error.title'),
        description:
          error instanceof Error
            ? error.message
            : t('apiKeys.toast.error.createFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteApiKey = async () => {
    if (!currentProject?.uuid || !keyToDelete?.uuid) {
      return;
    }
    try {
      setIsDeleting(true);
      await deleteApiKey(keyToDelete.uuid, currentProject?.uuid);
      await mutate();
      setKeyToDelete(null);
      toast({
        title: t('apiKeys.toast.deleted.title'),
        description: t('apiKeys.toast.deleted.description'),
      });
    } catch (error) {
      toast({
        title: t('apiKeys.toast.error.title'),
        description:
          error instanceof Error
            ? error.message
            : t('apiKeys.toast.error.deleteFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      <div className='flex justify-between items-center mb-4'>
        <h1 className='text-2xl font-bold'>{t('apiKeys.title')}</h1>
        <Button
          onClick={() => setIsCreateDialogOpen(true)}
          disabled={!currentProject?.uuid}>
          <Plus className='h-4 w-4 mr-2' />
          {t('apiKeys.actions.create')}
        </Button>
      </div>

      <div>
        {isLoading ? (
          <div>Loading...</div>
        ) : error ? (
          <div className='text-red-500'>
            {error instanceof Error
              ? error.message
              : t('common.errors.unexpected')}
          </div>
        ) : (
          <div className='space-y-4'>
            <div className='text-sm text-muted-foreground'>
              {t('apiKeys.description')}
            </div>
            {apiKeys && apiKeys.length === 0 && (
              <div className='text-sm text-muted-foreground'>
                {t('apiKeys.empty')}
              </div>
            )}
            {apiKeys &&
              apiKeys.map((apiKey: ApiKey) => (
                <div key={apiKey.uuid} className='space-y-2'>
                  {apiKey.name && (
                    <div className='text-sm font-medium'>{apiKey.name}</div>
                  )}
                  <div className='flex items-center gap-2 bg-muted p-3 rounded-lg'>
                    <code className='flex-1 font-mono text-sm'>
                      {revealed ? apiKey.api_key : maskApiKey(apiKey.api_key)}
                    </code>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={toggleReveal}
                      title={
                        revealed
                          ? t('apiKeys.actions.hide')
                          : t('apiKeys.actions.show')
                      }>
                      {revealed ? (
                        <EyeOff className='h-4 w-4' />
                      ) : (
                        <Eye className='h-4 w-4' />
                      )}
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => copyApiKey(apiKey.api_key)}
                      title={t('apiKeys.actions.copy')}>
                      <Copy className='h-4 w-4' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => setKeyToDelete(apiKey)}
                      title={t('apiKeys.actions.delete')}>
                      <Trash2 className='h-4 w-4 text-destructive' />
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('apiKeys.dialog.create.title')}</DialogTitle>
            <DialogDescription>
              {t('apiKeys.dialog.create.description')}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4 py-4'>
            <div className='space-y-2'>
              <Label htmlFor='name'>{t('apiKeys.dialog.create.nameLabel')}</Label>
              <Input
                id='name'
                placeholder={t('apiKeys.dialog.create.namePlaceholder')}
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setIsCreateDialogOpen(false)}>
              {t('apiKeys.actions.cancel')}
            </Button>
            <Button onClick={handleCreateApiKey} disabled={isCreating}>
              {isCreating
                ? t('apiKeys.actions.creating')
                : t('apiKeys.actions.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!keyToDelete}
        onOpenChange={(open) => !open && setKeyToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('apiKeys.dialog.delete.title')}</DialogTitle>
            <DialogDescription>
              {t('apiKeys.dialog.delete.description', {
                name: keyToDelete?.name
                  ? t('apiKeys.dialog.delete.namePrefix') + keyToDelete.name + '"'
                  : '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setKeyToDelete(null)}>
              {t('apiKeys.actions.cancel')}
            </Button>
            <Button
              variant='destructive'
              onClick={handleDeleteApiKey}
              disabled={isDeleting}>
              {isDeleting
                ? t('apiKeys.actions.deleting')
                : t('apiKeys.actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
