'use client';

import { Check, ChevronsUpDown, PlusCircle } from 'lucide-react';
import * as React from 'react';

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
  const { projects, currentProject, setCurrentProject, mutate, isAuthenticated } = useProjects();
  const [open, setOpen] = React.useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = React.useState(false);
  const [newProjectName, setNewProjectName] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);

  // Don't render anything if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  if (!projects) {
    return <span>Loading Projects...</span>;
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
        <p className='text-xs font-medium p-1'>Hubs</p>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant='outline'
              role='combobox'
              aria-expanded={open}
              aria-label='Select a hub'
              className='w-full justify-between'>
              {currentProject?.name ?? 'Loading Hubs...'}
              <ChevronsUpDown className='ml-auto h-4 w-4 shrink-0 opacity-50' />
            </Button>
          </PopoverTrigger>
          <PopoverContent className='w-[--radix-popover-trigger-width] p-0'>
            <Command>
              <CommandList>
                <CommandInput placeholder='Search hubs...' />
                <CommandEmpty>No hub found.</CommandEmpty>
                <CommandGroup heading='Hubs'>
                  {projects.map((project: Project) => (
                    <CommandItem
                      key={project.uuid}
                      onSelect={() => {
                        setCurrentProject(project);
                        setOpen(false);
                      }}
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
                    Create Hub
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
            <DialogTitle>Create Hub</DialogTitle>
            <DialogDescription>
              Add a new hub to organize your work.
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 py-4'>
            <div className='grid gap-2'>
              <Label htmlFor='name'>Hub name</Label>
              <Input
                id='name'
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder='Enter hub name'
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setShowNewProjectDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={!newProjectName || isCreating}>
              {isCreating ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
