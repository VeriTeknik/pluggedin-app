'use client';

import { Check, ChevronsUpDown, PlusCircle } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { createProject } from '@/app/actions/projects';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useProjects } from '@/hooks/use-projects';
import { cn } from '@/lib/utils';
import { Project } from '@/types/project';

export function ProjectSwitcher() {
  const { t } = useTranslation();
  const { projects, currentProject, setCurrentProject, mutate, isAuthenticated } = useProjects();
  const [open, setOpen] = React.useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = React.useState(false);
  const [newProjectName, setNewProjectName] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);
  const [isSwitchingHub, setIsSwitchingHub] = React.useState(false);
  const switchingHubTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (switchingHubTimerRef.current) {
        clearTimeout(switchingHubTimerRef.current);
        switchingHubTimerRef.current = null;
      }
    };
  }, []);

  // Don't render anything if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  // Ensure projects is an array
  if (!projects || !Array.isArray(projects)) {
    return <span>{t('projects.loading')}</span>;
  }

  async function handleCreateProject() {
    try {
      setIsCreating(true);
      const project = await createProject(newProjectName);
      setCurrentProject(project);
      setNewProjectName('');
      setShowNewProjectDialog(false);
      mutate();
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className='flex flex-col gap-2 w-full p-2'>
      <div>
        <p className='text-xs font-medium p-1'>{t('projects.hubs')}</p>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant='outline'
              role='combobox'
              aria-expanded={open}
              aria-label={t('projects.hubs')}
              className='w-full justify-between'
              disabled={isSwitchingHub}>
              {isSwitchingHub ? t('projects.switchingHub') : (currentProject?.name ?? t('projects.loadingHubs'))}
              <ChevronsUpDown className='ml-auto h-4 w-4 shrink-0 opacity-50' />
            </Button>
          </PopoverTrigger>
          <PopoverContent className='w-[--radix-popover-trigger-width] p-0'>
            <Command>
              <CommandList>
                <CommandInput placeholder={t('projects.searchHubs')} />
                <CommandEmpty>{t('projects.noHubFound')}</CommandEmpty>
                <CommandGroup heading={t('projects.hubs')}>
                  {(Array.isArray(projects) ? projects : []).map((project: Project) => (
                    <CommandItem
                      key={project.uuid}
                      onSelect={() => {
                        if (isSwitchingHub) return; // Prevent multiple rapid clicks
                        setIsSwitchingHub(true);
                        setCurrentProject(project);
                        setOpen(false);
                        if (switchingHubTimerRef.current) {
                          clearTimeout(switchingHubTimerRef.current);
                        }
                        switchingHubTimerRef.current = setTimeout(() => {
                          setIsSwitchingHub(false);
                          switchingHubTimerRef.current = null;
                        }, 500);
                      }}
                      disabled={isSwitchingHub}
                      className='text-sm'>
                      {project.name}
                      <Check
                        className={cn(
                          'ml-auto h-4 w-4',
                          currentProject?.uuid === project.uuid
                            ? 'opacity-100'
                            : 'opacity-0'
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
              <CommandSeparator />
              <CommandList>
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setOpen(false);
                      setShowNewProjectDialog(true);
                    }}>
                    <PlusCircle className='mr-2 h-4 w-4' />
                    {t('projects.createHub')}
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <Dialog
        open={showNewProjectDialog}
        onOpenChange={setShowNewProjectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('projects.createHubDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('projects.createHubDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 py-4'>
            <div className='grid gap-2'>
              <Label htmlFor='name'>{t('projects.createHubDialog.hubName')}</Label>
              <Input
                id='name'
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder={t('projects.createHubDialog.placeholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setShowNewProjectDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={!newProjectName || isCreating}>
              {isCreating ? t('projects.createHubDialog.creating') : t('projects.createHubDialog.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
