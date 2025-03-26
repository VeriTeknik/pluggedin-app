'use client';

import { AlertTriangle, Pencil, Save, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { deleteProject, updateProjectName } from '@/app/actions/projects';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useProjects } from '@/hooks/use-projects';
import { useToast } from '@/hooks/use-toast';

export function CurrentProjectSection() {
  const { t } = useTranslation();
  const { currentProject, setCurrentProject, mutate } = useProjects();
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(currentProject?.name || '');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  if (!currentProject) {
    return <span>{t('settings.project.loading', 'Loading Project...')}</span>;
  }

  const handleUpdate = async () => {
    if (newName.trim() === '') return;
    setIsLoading(true);
    try {
      await updateProjectName(currentProject.uuid, newName.trim());
      await mutate();
      setIsEditing(false);
      toast({
        title: t('common.success'),
        description: t('settings.project.updateSuccess', 'Project name updated successfully'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description:
          error instanceof Error
            ? error.message
            : t('settings.project.updateError', 'Failed to update project name'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        t('settings.project.deleteConfirm', 'Are you sure you want to delete this project? This action cannot be undone.')
      )
    ) {
      return;
    }

    setIsLoading(true);
    try {
      await deleteProject(currentProject.uuid);
      setCurrentProject(null);
      await mutate();
      toast({
        title: t('common.success'),
        description: t('settings.project.deleteSuccess', 'Project deleted successfully'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description:
          error instanceof Error ? error.message : t('settings.project.deleteError', 'Failed to delete project'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.project.title', 'Current Hub')}</CardTitle>
        <CardDescription>{t('settings.project.description', 'Manage your current hub settings')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-6'>
        <div className='space-y-4'>
          <div className='flex items-center gap-4'>
            {isEditing ? (
              <>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('settings.project.namePlaceholder', 'Project name')}
                  className='flex-1'
                />
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => {
                    setIsEditing(false);
                    setNewName(currentProject.name);
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
                <span className='flex-1 text-lg'>{currentProject.name}</span>
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => {
                    setIsEditing(true);
                    setNewName(currentProject.name);
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
              {t('settings.project.dangerZone', 'Danger Zone')}
            </h3>
            <p className='text-sm text-muted-foreground mt-1'>
              {t('settings.project.deleteWarning', 'Once you delete a project, there is no going back. Please be careful.')}
            </p>
            <Button
              variant='destructive'
              className='mt-4'
              onClick={handleDelete}
              disabled={isLoading}>
              {t('settings.project.deleteButton', 'Delete Project')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
