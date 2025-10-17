'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import {
  createUserApiKey,
  deleteUserApiKey,
  getUserApiKeys,
  updateApiKeyPermissions,
} from '@/app/actions/api-keys';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiKeyCard } from '@/components/api-keys/ApiKeyCard';
import { ApiKeyFormDialog } from '@/components/api-keys/ApiKeyFormDialog';
import { useProjects } from '@/hooks/use-projects';
import { useToast } from '@/hooks/use-toast';
import { ApiKey } from '@/types/api-key';

export default function ApiKeysPage() {
  const { projects } = useProjects();
  const {
    data: apiKeys,
    error,
    isLoading,
    mutate,
  } = useSWR('user-api-keys', getUserApiKeys);

  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyDescription, setNewKeyDescription] = useState('');
  const [newKeyScope, setNewKeyScope] = useState<'all_projects' | 'specific_projects'>('all_projects');
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<ApiKey | null>(null);
  const [keyToEdit, setKeyToEdit] = useState<ApiKey | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const copyApiKey = async (apiKey: string) => {
    await navigator.clipboard.writeText(apiKey);
    toast({
      title: t('apiKeys.toast.copied.title'),
      description: t('apiKeys.toast.copied.description'),
    });
  };

  const toggleReveal = (keyUuid: string) => {
    setRevealed(prev => ({ ...prev, [keyUuid]: !prev[keyUuid] }));
  };

  const maskApiKey = (key: string) => {
    // For short keys, mask everything to prevent exposure
    if (key.length < 20) {
      return '•'.repeat(key.length);
    }
    // For longer keys, show first 10 and last 4 characters
    return `${key.slice(0, 10)}${'•'.repeat(Math.max(0, key.length - 14))}${key.slice(-4)}`;
  };

  const handleCreateApiKey = async () => {
    try {
      setIsCreating(true);
      await createUserApiKey({
        name: newKeyName || 'API Key',
        description: newKeyDescription || undefined,
        scope: newKeyScope,
        projectUuids: newKeyScope === 'specific_projects' ? selectedProjects : undefined,
      });
      await mutate();
      setIsCreateDialogOpen(false);
      setNewKeyName('');
      setNewKeyDescription('');
      setNewKeyScope('all_projects');
      setSelectedProjects([]);
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
    if (!keyToDelete?.uuid) return;

    try {
      setIsDeleting(true);
      await deleteUserApiKey(keyToDelete.uuid);
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

  const handleUpdateApiKey = async () => {
    if (!keyToEdit?.uuid) return;

    try {
      setIsUpdating(true);
      await updateApiKeyPermissions(keyToEdit.uuid, {
        name: newKeyName || keyToEdit.name || undefined,
        description: newKeyDescription || undefined,
        scope: newKeyScope,
        projectUuids: newKeyScope === 'specific_projects' ? selectedProjects : undefined,
        is_active: keyToEdit.is_active,
      });
      await mutate();
      setKeyToEdit(null);
      toast({
        title: t('apiKeys.toast.updated.title'),
        description: t('apiKeys.toast.updated.description'),
      });
    } catch (error) {
      toast({
        title: t('apiKeys.toast.error.title'),
        description:
          error instanceof Error
            ? error.message
            : t('apiKeys.toast.error.updateFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const openEditDialog = (key: ApiKey) => {
    setKeyToEdit(key);
    setNewKeyName(key.name || '');
    setNewKeyDescription(key.description || '');
    setNewKeyScope(key.all_projects_access ? 'all_projects' : 'specific_projects');
    setSelectedProjects(key.project_permissions || []);
  };

  return (
    <div>
      <div className='flex justify-between items-center mb-6'>
        <div>
          <h1 className='text-2xl font-bold'>{t('apiKeys.title')}</h1>
          <p className='text-muted-foreground mt-1'>
            {t('apiKeys.description', 'Manage your API keys for programmatic access')}
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className='h-4 w-4 mr-2' />
          {t('apiKeys.actions.create')}
        </Button>
      </div>

      {isLoading ? (
        <div className='flex items-center justify-center py-8'>
          <div className='text-muted-foreground'>Loading...</div>
        </div>
      ) : error ? (
        <div className='text-red-500'>
          {error instanceof Error ? error.message : t('common.errors.unexpected')}
        </div>
      ) : (
        <div className='space-y-4'>
          {apiKeys && apiKeys.length === 0 && (
            <Card>
              <CardContent className='py-8 text-center text-muted-foreground'>
                {t('apiKeys.empty')}
              </CardContent>
            </Card>
          )}
          {apiKeys &&
            apiKeys.map((apiKey: ApiKey) => (
              <ApiKeyCard
                key={apiKey.uuid}
                apiKey={apiKey}
                revealed={revealed[apiKey.uuid]}
                onReveal={() => toggleReveal(apiKey.uuid)}
                onCopy={() => copyApiKey(apiKey.api_key)}
                onEdit={() => openEditDialog(apiKey)}
                onDelete={() => setKeyToDelete(apiKey)}
                maskApiKey={maskApiKey}
              />
            ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <ApiKeyFormDialog
        open={isCreateDialogOpen || !!keyToEdit}
        onClose={() => {
          setIsCreateDialogOpen(false);
          setKeyToEdit(null);
          setNewKeyName('');
          setNewKeyDescription('');
          setNewKeyScope('all_projects');
          setSelectedProjects([]);
        }}
        onSave={keyToEdit ? handleUpdateApiKey : handleCreateApiKey}
        loading={isCreating || isUpdating}
        projects={projects || []}
        formValues={{
          editing: !!keyToEdit,
          name: newKeyName,
          description: newKeyDescription,
          scope: newKeyScope,
          selectedProjects,
        }}
        onChange={(field, value) => {
          switch (field) {
            case 'name':
              setNewKeyName(value);
              break;
            case 'description':
              setNewKeyDescription(value);
              break;
            case 'scope':
              setNewKeyScope(value);
              break;
            case 'selectedProjects':
              setSelectedProjects(value);
              break;
          }
        }}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!keyToDelete}
        onOpenChange={(open) => !open && setKeyToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('apiKeys.dialog.delete.title')}</DialogTitle>
            <DialogDescription>
              {t('apiKeys.dialog.delete.description', {
                name: keyToDelete?.name || '',
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
