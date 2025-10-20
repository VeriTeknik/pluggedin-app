import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { getProjects } from '@/app/actions/projects';
import { useToast } from '@/hooks/use-toast';
import { getUUIDFromLocalStorage, removeFromLocalStorage, setUUIDInLocalStorage } from '@/lib/storage-utils';
import { Project } from '@/types/project';

import { useSafeSession } from './use-safe-session';

const CURRENT_PROJECT_KEY = 'pluggedin-current-project';

type ProjectsStore = {
  currentProject: Project | null;
  hasInitialized: boolean;
};

const initialStore: ProjectsStore = {
  currentProject: null,
  hasInitialized: false,
};

let projectsStore: ProjectsStore = initialStore;

const subscribers = new Set<() => void>();

const getSnapshot = () => projectsStore;
const getServerSnapshot = () => projectsStore;

const subscribe = (callback: () => void) => {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
};

const updateStore = (partial: Partial<ProjectsStore>) => {
  const next: ProjectsStore = { ...projectsStore, ...partial };
  const projectChanged = projectsStore.currentProject !== next.currentProject;
  const initializedChanged = projectsStore.hasInitialized !== next.hasInitialized;

  if (!projectChanged && !initializedChanged) {
    return;
  }

  projectsStore = next;
  subscribers.forEach((listener) => listener());
};

const selectProject = (project: Project) => {
  updateStore({
    currentProject: project,
    hasInitialized: true,
  });
};

const clearProject = (resetInitialized: boolean) => {
  const nextInitialized = resetInitialized ? false : projectsStore.hasInitialized;
  updateStore({
    currentProject: null,
    hasInitialized: nextInitialized,
  });
};

const syncProjectReference = (project: Project) => {
  updateStore({
    currentProject: project,
  });
};

export const useProjects = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { status: sessionStatus } = useSafeSession();

  // Track timer for cleanup to prevent memory leaks
  const projectEventTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

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
          _error?.message?.toLowerCase().includes('unauthorized') ||
          _error?.message?.toLowerCase().includes('session expired');

        if (isAuthIssue) {
          removeFromLocalStorage(CURRENT_PROJECT_KEY);
        }
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

  const { currentProject, hasInitialized } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  // Track previous session status to detect instability
  const previousSessionStatusRef = useRef<string>('loading');
  const wasAuthenticatedRef = useRef(false);
  const sessionStatusStable = sessionStatus === previousSessionStatusRef.current;

  // Memoize projects array to prevent unnecessary re-renders
  // Ensure we always have an array, even if data is not an array
  const memoizedProjects = useMemo(() => {
    if (Array.isArray(data)) {
      return data;
    }
    return [];
  }, [data]);

  // Load saved project on mount only - runs ONCE when projects first load
  useEffect(() => {
    const wasAuthenticated = wasAuthenticatedRef.current;
    wasAuthenticatedRef.current = sessionStatus === 'authenticated';

    // Update session status ref
    previousSessionStatusRef.current = sessionStatus;

    if (sessionStatus === 'unauthenticated') {
      clearProject(true);
      return;
    }

    if (sessionStatus === 'loading' && wasAuthenticated) {
      return;
    }

    if (sessionStatus !== 'authenticated') {
      return;
    }

    // Don't run if session status is unstable (prevents excessive re-renders)
    if (!sessionStatusStable) {
      return;
    }

    // Only initialize once when projects first load
    if (hasInitialized || !memoizedProjects.length || isLoading) {
      return;
    }

    try {
      const savedProjectUuid = getUUIDFromLocalStorage(CURRENT_PROJECT_KEY);
      if (savedProjectUuid) {
        const savedProject = memoizedProjects.find((p: Project) => p.uuid === savedProjectUuid);
        if (savedProject) {
           selectProject(savedProject);
           return;
         }
       }
       // If no saved project or saved project not found, use first project
       if (memoizedProjects.length > 0) {
         selectProject(memoizedProjects[0]);
       }
     } catch (error) {
       console.warn('Failed to load project:', error);
       clearProject(false);
     }
  }, [memoizedProjects, sessionStatus, isLoading, hasInitialized, sessionStatusStable]);

  // Persist project selection with memoized callback and debouncing
  const handleSetCurrentProject = useCallback((project: Project | null) => {
    // Clear any pending timer to prevent memory leaks
    if (projectEventTimerRef.current) {
      clearTimeout(projectEventTimerRef.current);
    }

    if (project) {
      selectProject(project);
      setUUIDInLocalStorage(CURRENT_PROJECT_KEY, project.uuid);
    } else {
      clearProject(false);
      removeFromLocalStorage(CURRENT_PROJECT_KEY);
    }

    // Store timer reference for cleanup
    projectEventTimerRef.current = setTimeout(() => {
      if (project && sessionStatus === 'authenticated' && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('projectChanged', {
            detail: { project },
          }),
        );
      }
    }, 100);
  }, [sessionStatus]);

  // Debounced SWR mutation to prevent excessive refetches during rapid Hub switches
  useEffect(() => {
    if (!currentProject || sessionStatus !== 'authenticated') {
      return;
    }

    // Longer debounce for SWR mutations (500ms) to prevent API spam
    // This is the most expensive operation that causes browser freezing
    const timer = setTimeout(() => {
      mutate();
    }, 500);

    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.uuid, mutate, sessionStatus]); // Use project UUID for more stable dependency

  // Keep the shared project reference in sync with the latest project data
  useEffect(() => {
    if (!currentProject) {
      return;
    }

    const updatedProject = memoizedProjects.find(
      (project: Project) => project.uuid === currentProject.uuid
    );

    if (updatedProject && updatedProject !== currentProject) {
      syncProjectReference(updatedProject);
    }
  }, [currentProject, memoizedProjects]);

  // Cleanup timer on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (projectEventTimerRef.current) {
        clearTimeout(projectEventTimerRef.current);
      }
    };
  }, []);

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
