'use client';

import { AlertTriangle, Pencil, Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { deleteProfile, updateProfileName } from '@/app/actions/profiles';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useProfiles } from '@/hooks/use-profiles';
import { useToast } from '@/hooks/use-toast';

export function CurrentProfileSection() {
  const { currentProfile, mutateProfiles, setCurrentProfile } = useProfiles();
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(currentProfile?.name || '');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!currentProfile) return;
    setNewName(currentProfile?.name);
  }, [currentProfile]);

  if (!currentProfile) {
    return <span>Loading Profile...</span>;
  }

  const handleUpdate = async () => {
    if (newName.trim() === '') return;
    setIsLoading(true);
    try {
      await updateProfileName(currentProfile.uuid, newName.trim());
      await mutateProfiles();
      setIsEditing(false);
      toast({
        title: 'Success',
        description: 'Profile name updated successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to update profile name',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        'Are you sure you want to delete this profile? This action cannot be undone.'
      )
    ) {
      return;
    }

    setIsLoading(true);
    try {
      await deleteProfile(currentProfile.uuid);
      setCurrentProfile(null);
      await mutateProfiles();
      toast({
        title: 'Success',
        description: 'Profile deleted successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to delete workspace',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Workspace</CardTitle>
        <CardDescription>Manage your Current Workspace settings</CardDescription>
      </CardHeader>
      <CardContent className='space-y-6'>
        <div className='space-y-4'>
          <div className='flex items-center gap-4'>
            {isEditing ? (
              <>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder='Profile name'
                  className='flex-1'
                />
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => {
                    setIsEditing(false);
                    setNewName(currentProfile.name);
                  }}
                  disabled={isLoading}>
                  <X className='h-4 w-4' />
                </Button>
                <Button
                  variant='default'
                  size='icon'
                  onClick={handleUpdate}
                  disabled={isLoading}>
                  <Save className='h-4 w-4' />
                </Button>
              </>
            ) : (
              <>
                <span className='flex-1 text-lg'>{currentProfile.name}</span>
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => {
                    setIsEditing(true);
                    setNewName(currentProfile.name);
                  }}
                  disabled={isLoading}>
                  <Pencil className='h-4 w-4' />
                </Button>
              </>
            )}
          </div>
        </div>

        <div className='space-y-4'>
          <div className='border-t pt-6'>
            <h3 className='text-lg font-medium text-destructive flex items-center gap-2'>
              <AlertTriangle className='h-5 w-5' />
              Danger Zone
            </h3>
            <p className='text-sm text-muted-foreground mt-1'>
              Once you delete a workspace, there is no going back. Please be
              careful.
            </p>
            <Button
              variant='destructive'
              className='mt-4'
              onClick={handleDelete}
              disabled={isLoading}>
              Delete Workspace
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
