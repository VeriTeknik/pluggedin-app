'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import useSWR from 'swr';

import { getProjects } from '@/app/actions/projects';
import { useLocalStorageState } from '@/hooks/use-local-storage-state';
import { useSafeSession } from '@/hooks/use-safe-session';
import { useToast } from '@/hooks/use-toast';
import { isValidUUID } from '@/lib/storage-utils';
import { Project } from '@/types/project';
import { useTranslation } from 'react-i18next';

const CURRENT_PROJECT_KEY = 'pluggedin-current-project';

type ProjectsContextValue = {
  projects: Project[];
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;
  mutate: () => Promise<Project[] | undefined>;
  isLoading: boolean;
  error: Error | undefined;
  isAuthenticated: boolean;
};

const ProjectsContext = createContext<ProjectsContextValue | undefined>(undefined);

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { status: sessionStatus } = useSafeSession();
  const isAuthenticated = sessionStatus === 'authenticated';

  const [storedProjectUuid, setStoredProjectUuid] = useLocalStorageState<string | null>(
    CURRENT_PROJECT_KEY,
    null
  );

  useEffect(() => {
    if (storedProjectUuid && !isValidUUID(storedProjectUuid)) {
      setStoredProjectUuid(null);
    }
  }, [storedProjectUuid, setStoredProjectUuid]);

  const {
    data,
    mutate,
    error,
    isLoading,
  } = useSWR(
    isAuthenticated ? 'projects' : null,
    getProjects,
    {
      onError: (_error: Error) => {
        console.error('Projects error:', _error);
        toast({
          title: t('common.error'),
          description: _error?.message || t('common.errors.unexpected'),
          variant: 'destructive',
        });
        setStoredProjectUuid(null);
      },
      shouldRetryOnError: (_err: Error) => {
        if (
          _err?.message?.includes('Unauthorized') ||
          _err?.message?.includes('Session expired') ||
          _err?.message?.includes('Server Components render')
        ) {
          return false;
        }
        return true;
      },
      errorRetryCount: 2,
    }
  );

  const projects = useMemo<Project[]>(() => {
    if (Array.isArray(data)) {
      return data;
    }
    return [];
  }, [data]);

  const currentProject = useMemo<Project | null>(() => {
    if (!isAuthenticated || projects.length === 0) {
      return null;
    }

    if (storedProjectUuid) {
      const match = projects.find((project) => project.uuid === storedProjectUuid);
      if (match) {
        return match;
      }
    }

    return projects[0] ?? null;
  }, [isAuthenticated, projects, storedProjectUuid]);

  useEffect(() => {
    if (!isAuthenticated) {
      if (storedProjectUuid !== null) {
        setStoredProjectUuid(null);
      }
      return;
    }

    if (!projects.length) {
      return;
    }

    if (currentProject && storedProjectUuid !== currentProject.uuid) {
      setStoredProjectUuid(currentProject.uuid);
    }
  }, [currentProject, isAuthenticated, projects, setStoredProjectUuid, storedProjectUuid]);

  const previousProjectUuidRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAuthenticated || !currentProject) {
      previousProjectUuidRef.current = null;
      return;
    }

    if (previousProjectUuidRef.current === currentProject.uuid) {
      return;
    }

    previousProjectUuidRef.current = currentProject.uuid;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('projectChanged', {
          detail: { project: currentProject },
        })
      );
    }
  }, [currentProject, isAuthenticated]);

  useEffect(() => {
    if (!currentProject || !isAuthenticated) {
      return;
    }

    const timer = window.setTimeout(() => {
      mutate();
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [currentProject?.uuid, isAuthenticated, mutate]);

  const handleSetCurrentProject = useCallback(
    (project: Project | null) => {
      if (!isAuthenticated) {
        return;
      }

      if (!project) {
        setStoredProjectUuid(null);
        return;
      }

       const existsInList = projects.some((item) => item.uuid === project.uuid);
       if (!existsInList) {
         console.warn('Attempted to select project that is not available in context');
         return;
       }

      if (project.uuid === storedProjectUuid) {
        return;
      }

      setStoredProjectUuid(project.uuid);
    },
    [isAuthenticated, projects, setStoredProjectUuid, storedProjectUuid]
  );

  const contextValue = useMemo<ProjectsContextValue>(
    () => ({
      projects,
      currentProject,
      setCurrentProject: handleSetCurrentProject,
      mutate,
      isLoading: isLoading || sessionStatus === 'loading',
      error: error as Error | undefined,
      isAuthenticated,
    }),
    [
      currentProject,
      error,
      handleSetCurrentProject,
      isAuthenticated,
      isLoading,
      mutate,
      projects,
      sessionStatus,
    ]
  );

  return <ProjectsContext.Provider value={contextValue}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const context = useContext(ProjectsContext);
  if (!context) {
    throw new Error('useProjects must be used within a ProjectsProvider');
  }
  return context;
}

export { CURRENT_PROJECT_KEY };
