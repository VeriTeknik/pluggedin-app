'use client';

import { Copy, Eye, EyeOff, Key, Plus, Settings, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';

import {
  createUserApiKey,
  deleteUserApiKey,
  getUserApiKeys,
  updateApiKeyPermissions,
} from '@/app/actions/api-keys';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
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
              <Card key={apiKey.uuid}>
                <CardHeader>
                  <div className='flex items-start justify-between'>
                    <div className='space-y-1'>
                      <CardTitle className='text-lg flex items-center gap-2'>
                        <Key className='h-4 w-4' />
                        {apiKey.name}
                      </CardTitle>
                      {apiKey.description && (
                        <CardDescription>{apiKey.description}</CardDescription>
                      )}
                    </div>
                    <div className='flex items-center gap-2'>
                      {!apiKey.is_active && (
                        <Badge variant='secondary'>{t('apiKeys.status.inactive', 'Inactive')}</Badge>
                      )}
                      {apiKey.expires_at && new Date(apiKey.expires_at) < new Date() && (
                        <Badge variant='destructive'>{t('apiKeys.status.expired', 'Expired')}</Badge>
                      )}
                      {apiKey.project_uuid && !apiKey.project && (
                        <Badge variant='outline'>
                          {t('apiKeys.status.projectDeleted', 'Project deleted')}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <div className='flex items-center gap-2 bg-muted p-3 rounded-lg'>
                    <code className='flex-1 font-mono text-sm'>
                      {revealed[apiKey.uuid] ? apiKey.api_key : maskApiKey(apiKey.api_key)}
                    </code>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => toggleReveal(apiKey.uuid)}
                      title={
                        revealed[apiKey.uuid]
                          ? t('apiKeys.actions.hide')
                          : t('apiKeys.actions.show')
                      }>
                      {revealed[apiKey.uuid] ? (
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
                      onClick={() => openEditDialog(apiKey)}
                      title={t('apiKeys.actions.edit', 'Edit')}>
                      <Settings className='h-4 w-4' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => setKeyToDelete(apiKey)}
                      title={t('apiKeys.actions.delete')}>
                      <Trash2 className='h-4 w-4 text-destructive' />
                    </Button>
                  </div>

                  <div className='grid grid-cols-2 gap-4 text-sm'>
                    <div>
                      <span className='text-muted-foreground'>{t('apiKeys.scope', 'Scope')}:</span>{' '}
                      {apiKey.all_projects_access ? (
                        <Badge>{t('apiKeys.scope.allProjects', 'All Projects')}</Badge>
                      ) : apiKey.project_permissions?.length ? (
                        <Badge variant='secondary'>
                          {t('apiKeys.scope.specificProjects', '{{count}} Projects', {
                            count: apiKey.project_permissions.length,
                          })}
                        </Badge>
                      ) : (
                        <Badge variant='outline'>{t('apiKeys.scope.noProjects', 'No Projects')}</Badge>
                      )}
                    </div>
                    <div>
                      <span className='text-muted-foreground'>{t('apiKeys.usage', 'Usage')}:</span>{' '}
                      {apiKey.usage_count || 0} {t('apiKeys.requests', 'requests')}
                    </div>
                    <div>
                      <span className='text-muted-foreground'>{t('apiKeys.created', 'Created')}:</span>{' '}
                      {formatDistanceToNow(new Date(apiKey.created_at), { addSuffix: true })}
                    </div>
                    <div>
                      <span className='text-muted-foreground'>{t('apiKeys.lastUsed', 'Last used')}:</span>{' '}
                      {apiKey.last_used_at
                        ? formatDistanceToNow(new Date(apiKey.last_used_at), { addSuffix: true })
                        : t('apiKeys.neverUsed', 'Never')}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog
        open={isCreateDialogOpen || !!keyToEdit}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setKeyToEdit(null);
            setNewKeyName('');
            setNewKeyDescription('');
            setNewKeyScope('all_projects');
            setSelectedProjects([]);
          }
        }}>
        <DialogContent className='max-w-2xl'>
          <DialogHeader>
            <DialogTitle>
              {keyToEdit
                ? t('apiKeys.dialog.edit.title', 'Edit API Key')
                : t('apiKeys.dialog.create.title')}
            </DialogTitle>
            <DialogDescription>
              {keyToEdit
                ? t('apiKeys.dialog.edit.description', 'Update API key settings and permissions')
                : t('apiKeys.dialog.create.description')}
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

            <div className='space-y-2'>
              <Label htmlFor='description'>
                {t('apiKeys.dialog.create.descriptionLabel', 'Description (optional)')}
              </Label>
              <Textarea
                id='description'
                placeholder={t('apiKeys.dialog.create.descriptionPlaceholder', 'Describe what this key is used for')}
                value={newKeyDescription}
                onChange={(e) => setNewKeyDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className='space-y-2'>
              <Label>{t('apiKeys.dialog.create.scopeLabel', 'Access Scope')}</Label>
              <RadioGroup value={newKeyScope} onValueChange={(value: any) => setNewKeyScope(value)}>
                <div className='flex items-center space-x-2'>
                  <RadioGroupItem value='all_projects' id='all_projects' />
                  <Label htmlFor='all_projects'>
                    {t('apiKeys.dialog.create.allProjectsLabel', 'All projects')}
                  </Label>
                </div>
                <div className='flex items-center space-x-2'>
                  <RadioGroupItem value='specific_projects' id='specific_projects' />
                  <Label htmlFor='specific_projects'>
                    {t('apiKeys.dialog.create.specificProjectsLabel', 'Specific projects')}
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {newKeyScope === 'specific_projects' && projects && projects.length > 0 && (
              <div className='space-y-2'>
                <Label>{t('apiKeys.dialog.create.selectProjectsLabel', 'Select Projects')}</Label>
                <div className='space-y-2 max-h-48 overflow-y-auto border rounded-lg p-4'>
                  {projects.map((project) => (
                    <div key={project.uuid} className='flex items-center space-x-2'>
                      <Checkbox
                        id={project.uuid}
                        checked={selectedProjects.includes(project.uuid)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedProjects([...selectedProjects, project.uuid]);
                          } else {
                            setSelectedProjects(
                              selectedProjects.filter((id) => id !== project.uuid)
                            );
                          }
                        }}
                      />
                      <Label htmlFor={project.uuid} className='font-normal cursor-pointer'>
                        {project.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setIsCreateDialogOpen(false);
                setKeyToEdit(null);
              }}>
              {t('apiKeys.actions.cancel')}
            </Button>
            <Button
              onClick={keyToEdit ? handleUpdateApiKey : handleCreateApiKey}
              disabled={isCreating || isUpdating}>
              {isCreating || isUpdating
                ? t('apiKeys.actions.saving', 'Saving...')
                : keyToEdit
                ? t('apiKeys.actions.save', 'Save Changes')
                : t('apiKeys.actions.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
