import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { getProjects } from '@/app/actions/projects';
import { Project } from '@/types/project';

const CURRENT_PROJECT_KEY = 'pluggedin-current-project';

export const useProjects = () => {
  const { data = [], mutate, isLoading } = useSWR('projects', getProjects, {
    onError: () => []
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
