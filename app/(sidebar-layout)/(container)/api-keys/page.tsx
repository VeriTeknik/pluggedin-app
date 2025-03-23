'use client';

import { Copy, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';

import {
  createApiKey,
  deleteApiKey,
  getProjectApiKeys,
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
    () => getProjectApiKeys(currentProject?.uuid || '')
  );
  const [revealed, setRevealed] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<ApiKey | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const copyApiKey = async (apiKey: string) => {
    await navigator.clipboard.writeText(apiKey);
    toast({
      title: 'API Key copied',
      description: 'The API key has been copied to your clipboard.',
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
        title: 'API Key created',
        description: 'Your new API key has been created successfully.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to create API key',
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
      await deleteApiKey(currentProject?.uuid, keyToDelete.uuid);
      await mutate();
      setKeyToDelete(null);
      toast({
        title: 'API Key deleted',
        description: 'Your API key has been deleted successfully.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to delete API key',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      <div className='flex justify-between items-center mb-4'>
        <h1 className='text-2xl font-bold'>API Keys</h1>
        <Button
          onClick={() => setIsCreateDialogOpen(true)}
          disabled={!currentProject?.uuid}>
          <Plus className='h-4 w-4 mr-2' />
          Create API Key
        </Button>
      </div>

      <div>
        {isLoading ? (
          <div>Loading...</div>
        ) : error ? (
          <div className='text-red-500'>
            {error instanceof Error
              ? error.message
              : 'Failed to fetch API keys'}
          </div>
        ) : (
          <div className='space-y-4'>
            <div className='text-sm text-muted-foreground'>
              Your API keys are used to authenticate requests to the Plugged.in
              API. Keep them secure and do not share them with others.
            </div>
            {apiKeys && apiKeys.length === 0 && (
              <div className='text-sm text-muted-foreground'>
                No API keys yet. Create one to get started.
              </div>
            )}
            {apiKeys &&
              apiKeys.map((apiKey) => (
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
                      title={revealed ? 'Hide API key' : 'Show API key'}>
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
                      title='Copy API key'>
                      <Copy className='h-4 w-4' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => setKeyToDelete(apiKey)}
                      title='Delete API key'>
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
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Create a new API key for your project. You can optionally give it
              a name to help identify its purpose.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4 py-4'>
            <div className='space-y-2'>
              <Label htmlFor='name'>API Key Name (Optional)</Label>
              <Input
                id='name'
                placeholder='e.g.,, Production API Key'
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateApiKey} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create API Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!keyToDelete}
        onOpenChange={(open) => !open && setKeyToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete API Key</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this API key
              {keyToDelete?.name ? ` "${keyToDelete.name}"` : ''}? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setKeyToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={handleDeleteApiKey}
              disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete API Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
