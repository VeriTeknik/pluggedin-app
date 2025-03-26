import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { getProjects } from '@/app/actions/projects';
import { useToast } from '@/hooks/use-toast';
import { Project } from '@/types/project';

const CURRENT_PROJECT_KEY = 'pluggedin-current-project';

export const useProjects = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data = [], mutate, isLoading } = useSWR('projects', getProjects, {
    onError: (error) => {
      // Handle session-related errors
      if (
        error?.message?.includes('User not found in database') ||
        error?.message?.includes('Unauthorized') ||
        error?.message?.includes('Session expired') ||
        error?.message?.toLowerCase().includes('session') ||
        error?.message?.toLowerCase().includes('auth')
      ) {
        // Show toast notification
        toast({
          title: t('common.error'),
          description: t('common.errors.unexpected'),
          variant: 'destructive',
        });

        // Clear any session data
        localStorage.clear();
        sessionStorage.clear();
        
        // Redirect to logout for proper cleanup
        window.location.href = '/logout';
        return [];
      }

      // Handle other errors
      console.error('Projects error:', error);
      toast({
        title: t('common.error'),
        description: error?.message || t('common.errors.unexpected'),
        variant: 'destructive',
      });
      return [];
    }
  });
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  // Load saved project on mount
  useEffect(() => {
    try {
      const savedProjectUuid = localStorage.getItem(CURRENT_PROJECT_KEY);
      if (data?.length) {
        if (savedProjectUuid) {
          const savedProject = data.find((p) => p.uuid === savedProjectUuid);
          if (savedProject) {
            setCurrentProject(savedProject);
            return;
          }
        }
        // If no saved project or saved project not found, use first project
        setCurrentProject(data[0]);
      } else {
        setCurrentProject(null);
      }
    } catch (error) {
      console.warn('Failed to load project:', error);
      setCurrentProject(null);
    }
  }, [data]);

  // Persist project selection
  const handleSetCurrentProject = (project: Project | null) => {
    setCurrentProject(project);

    if (project) {
      localStorage.setItem(CURRENT_PROJECT_KEY, project.uuid);
    } else {
      localStorage.removeItem(CURRENT_PROJECT_KEY);
    }

    // Only reload if we're changing projects while authenticated
    if (project) {
      window.location.reload();
    }
  };

  return {
    projects: data ?? [],
    currentProject,
    setCurrentProject: handleSetCurrentProject,
    mutate,
    isLoading,
  };
};
