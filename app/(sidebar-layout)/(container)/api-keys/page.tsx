'use client';

import DOMPurify from 'dompurify';
import { Copy, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import {
  createApiKey,
  deleteApiKey,
  getUserApiKeys,
  updateApiKeyHub,
} from '@/app/actions/api-keys';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProjects } from '@/hooks/use-projects';
import { useToast } from '@/hooks/use-toast';
import { ApiKeyWithHub } from '@/types/api-key';

export default function ApiKeysPage() {
  const { currentProject, projects } = useProjects();
  const {
    data: apiKeys,
    error,
    isLoading,
    mutate,
  } = useSWR(
    'user/api-keys', // User-scoped, not Hub-filtered
    getUserApiKeys
  );
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<ApiKeyWithHub | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [keyToEdit, setKeyToEdit] = useState<ApiKeyWithHub | null>(null);
  const [selectedHubUuid, setSelectedHubUuid] = useState<string>('');
  const [isUpdatingHub, setIsUpdatingHub] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation('apiKeys');

  const copyApiKey = async (apiKey: string) => {
    await navigator.clipboard.writeText(apiKey);
    toast({
      title: t('toast.copied.title'),
      description: t('toast.copied.description'),
    });
  };

  const toggleReveal = (keyUuid: string) => {
    setRevealedKeys(prev => {
      const next = new Set(prev);
      if (next.has(keyUuid)) {
        next.delete(keyUuid);
      } else {
        next.add(keyUuid);
      }
      return next;
    });
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
        title: t('toast.created.title'),
        description: t('toast.created.description'),
      });
    } catch (error) {
      toast({
        title: t('toast.error.title'),
        description:
          error instanceof Error
            ? error.message
            : t('toast.error.createFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteApiKey = async () => {
    if (!keyToDelete?.uuid || !keyToDelete?.project_uuid) {
      return;
    }
    try {
      setIsDeleting(true);
      await deleteApiKey(keyToDelete.uuid, keyToDelete.project_uuid);
      await mutate();
      setKeyToDelete(null);
      toast({
        title: t('toast.deleted.title'),
        description: t('toast.deleted.description'),
      });
    } catch (error) {
      toast({
        title: t('toast.error.title'),
        description:
          error instanceof Error
            ? error.message
            : t('toast.error.deleteFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditHub = (apiKey: ApiKeyWithHub) => {
    setKeyToEdit(apiKey);
    setSelectedHubUuid(apiKey.project_uuid); // Set current Hub as default
  };

  const handleUpdateHub = async () => {
    if (!keyToEdit?.uuid || !selectedHubUuid) {
      return;
    }
    try {
      setIsUpdatingHub(true);
      await updateApiKeyHub(keyToEdit.uuid, selectedHubUuid);
      await mutate();
      setKeyToEdit(null);
      setSelectedHubUuid('');
      toast({
        title: t('toast.hubUpdated.title'),
        description: t('toast.hubUpdated.description'),
      });
    } catch (error) {
      toast({
        title: t('toast.error.title'),
        description:
          error instanceof Error
            ? error.message
            : t('toast.error.updateHubFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingHub(false);
    }
  };

  return (
    <div>
      <div className='flex justify-between items-center mb-4'>
        <h1 className='text-2xl font-bold'>{t('title')}</h1>
        <Button
          onClick={() => setIsCreateDialogOpen(true)}
          disabled={!currentProject?.uuid}>
          <Plus className='h-4 w-4 mr-2' />
          {t('actions.create')}
        </Button>
      </div>

      <div>
        {isLoading ? (
          <div>Loading...</div>
        ) : error ? (
          <div className='text-red-500'>
            {error instanceof Error
              ? error.message
              : 'An unexpected error occurred'}
          </div>
        ) : (
          <div className='space-y-4'>
            <div className='text-sm text-muted-foreground'>
              {t('description')}
            </div>
            {apiKeys && apiKeys.length === 0 && (
              <div className='text-sm text-muted-foreground'>
                {t('empty')}
              </div>
            )}
            {apiKeys &&
              apiKeys.map((apiKey: ApiKeyWithHub) => (
                <div key={apiKey.uuid} className='space-y-2'>
                  <div className='flex items-center gap-2 flex-wrap'>
                    {apiKey.name && (
                      <div className='text-sm font-medium'>
                        {DOMPurify.sanitize(apiKey.name, { ALLOWED_TAGS: [] })}
                      </div>
                    )}
                    <Badge variant='secondary' className='text-xs'>
                      Hub: {DOMPurify.sanitize(apiKey.project_name, { ALLOWED_TAGS: [] })}
                    </Badge>
                    <span className='text-xs text-muted-foreground'>
                      {apiKey.last_used_at
                        ? t('display.lastUsed', { date: new Date(apiKey.last_used_at).toLocaleString() })
                        : t('display.neverUsed')}
                    </span>
                  </div>
                  <div className='flex items-center gap-2 bg-muted p-3 rounded-lg'>
                    <code className='flex-1 font-mono text-sm'>
                      {revealedKeys.has(apiKey.uuid) ? apiKey.api_key : maskApiKey(apiKey.api_key)}
                    </code>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => toggleReveal(apiKey.uuid)}
                      title={
                        revealedKeys.has(apiKey.uuid)
                          ? t('actions.hide')
                          : t('actions.show')
                      }>
                      {revealedKeys.has(apiKey.uuid) ? (
                        <EyeOff className='h-4 w-4' />
                      ) : (
                        <Eye className='h-4 w-4' />
                      )}
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => copyApiKey(apiKey.api_key)}
                      title={t('actions.copy')}>
                      <Copy className='h-4 w-4' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => handleEditHub(apiKey)}
                      title={t('actions.editHub')}>
                      <Pencil className='h-4 w-4' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => setKeyToDelete(apiKey)}
                      title={t('actions.delete')}>
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
            <DialogTitle>{t('dialog.create.title')}</DialogTitle>
            <DialogDescription>
              {t('dialog.create.description')}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4 py-4'>
            <div className='space-y-2'>
              <Label htmlFor='name'>{t('dialog.create.nameLabel')}</Label>
              <Input
                id='name'
                placeholder={t('dialog.create.namePlaceholder')}
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setIsCreateDialogOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button onClick={handleCreateApiKey} disabled={isCreating}>
              {isCreating
                ? t('actions.creating')
                : t('actions.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!keyToDelete}
        onOpenChange={(open) => !open && setKeyToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dialog.delete.title')}</DialogTitle>
            <DialogDescription>
              {t('dialog.delete.description', {
                name: keyToDelete?.name
                  ? t('dialog.delete.namePrefix') + keyToDelete.name + '"'
                  : '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setKeyToDelete(null)}>
              {t('actions.cancel')}
            </Button>
            <Button
              variant='destructive'
              onClick={handleDeleteApiKey}
              disabled={isDeleting}>
              {isDeleting
                ? t('actions.deleting')
                : t('actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!keyToEdit}
        onOpenChange={(open) => {
          if (!open) {
            setKeyToEdit(null);
            setSelectedHubUuid('');
          }
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dialog.editHub.title')}</DialogTitle>
            <DialogDescription>
              {t('dialog.editHub.description')}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4 py-4'>
            <div className='space-y-2'>
              <Label htmlFor='hub-select'>{t('dialog.editHub.selectLabel')}</Label>
              <Select value={selectedHubUuid} onValueChange={setSelectedHubUuid}>
                <SelectTrigger id='hub-select'>
                  <SelectValue placeholder={t('actions.selectHub')} />
                </SelectTrigger>
                <SelectContent>
                  {projects && projects.length > 0 ? (
                    projects.map((project) => (
                      <SelectItem key={project.uuid} value={project.uuid}>
                        {DOMPurify.sanitize(project.name, { ALLOWED_TAGS: [] })}
                      </SelectItem>
                    ))
                  ) : (
                    <div className='p-2 text-sm text-muted-foreground'>
                      {t('dialog.editHub.noProjects')}
                    </div>
                  )}
                </SelectContent>
              </Select>
              {keyToEdit && (
                <p className='text-xs text-muted-foreground'>
                  Current Hub: {DOMPurify.sanitize(keyToEdit.project_name, { ALLOWED_TAGS: [] })}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setKeyToEdit(null);
                setSelectedHubUuid('');
              }}>
              {t('actions.cancel')}
            </Button>
            <Button
              onClick={handleUpdateHub}
              disabled={isUpdatingHub || !selectedHubUuid}>
              {isUpdatingHub ? t('actions.updating') : t('actions.editHub')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
