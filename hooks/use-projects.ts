import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { getProjects } from '@/app/actions/projects';
import { useToast } from '@/hooks/use-toast';
import { Project } from '@/types/project';

import { useSafeSession } from './use-safe-session';

const CURRENT_PROJECT_KEY = 'pluggedin-current-project';

export const useProjects = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { status: sessionStatus } = useSafeSession();

  // Only fetch projects if authenticated
  const { data = [], mutate, isLoading, error } = useSWR(
    // Only fetch if authenticated
    sessionStatus === 'authenticated' ? 'projects' : null,
    getProjects,
    {
      onError: (_error: Error) => {
        // Log the error but don't automatically redirect
        console.error('Projects error:', _error);
        
        // Show toast notification for user feedback
        toast({
          title: t('common.error'),
          description: _error?.message || t('common.errors.unexpected'),
          variant: 'destructive',
        });
        
        // For auth issues, clear the stored project
        const isAuthIssue = 
          error?.message?.toLowerCase().includes('unauthorized') ||
          error?.message?.toLowerCase().includes('session expired');
          
        if (isAuthIssue) {
          localStorage.removeItem(CURRENT_PROJECT_KEY);
        }
        
        return [];
      },
      // Add retry configuration
      shouldRetryOnError: (_err: Error) => {
        // Don't retry on auth errors or server component render errors
        if (
          _err?.message?.includes('Unauthorized') ||
          _err?.message?.includes('Session expired') ||
          _err?.message?.includes('Server Components render')
        ) {
          return false;
        }
        return true;
      },
      // Limit retries
      errorRetryCount: 2
    }
  );

  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  // Memoize projects array to prevent unnecessary re-renders
  const memoizedProjects = useMemo(() => data ?? [], [data]);

  // Load saved project on mount only if authenticated
  useEffect(() => {
    if (sessionStatus !== 'authenticated') {
      setCurrentProject(null);
      return;
    }

    try {
      const savedProjectUuid = localStorage.getItem(CURRENT_PROJECT_KEY);
      if (memoizedProjects.length) {
        if (savedProjectUuid) {
          const savedProject = memoizedProjects.find((p: Project) => p.uuid === savedProjectUuid);
          if (savedProject) {
            setCurrentProject(savedProject);
            return;
          }
        }
        // If no saved project or saved project not found, use first project
        setCurrentProject(memoizedProjects[0]);
      } else {
        setCurrentProject(null);
      }
    } catch (error) {
      console.warn('Failed to load project:', error);
      setCurrentProject(null);
    }
  }, [memoizedProjects, sessionStatus]);

  // Persist project selection with memoized callback
  const handleSetCurrentProject = useCallback((project: Project | null) => {
    setCurrentProject(project);

    if (project) {
      localStorage.setItem(CURRENT_PROJECT_KEY, project.uuid);
    } else {
      localStorage.removeItem(CURRENT_PROJECT_KEY);
    }

    // Instead of reloading, invalidate specific SWR caches
    // This will trigger re-fetches for data that depends on the current project
    if (project && sessionStatus === 'authenticated') {
      // Trigger a mutation to refetch project-specific data
      // Using the specific key 'projects' that matches our SWR key
      mutate('projects');
      
      // Emit a custom event that other components can listen to
      // This allows components to react to project changes without coupling
      window.dispatchEvent(new CustomEvent('projectChanged', { 
        detail: { project } 
      }));
    }
  }, [mutate, sessionStatus]);

  return {
    projects: memoizedProjects,
    currentProject,
    setCurrentProject: handleSetCurrentProject,
    mutate,
    isLoading: isLoading || sessionStatus === 'loading',
    error,
    isAuthenticated: sessionStatus === 'authenticated'
  };
};
