import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { getProjects } from '@/app/actions/projects';
import { Project } from '@/types/project';

const CURRENT_PROJECT_KEY = 'pluggedin-current-project';

export const useProjects = () => {
  const { data, mutate, isLoading } = useSWR('projects', getProjects);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  // Load saved project on mount
  useEffect(() => {
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

    window.location.reload();
  };

  return {
    projects: data ?? [],
    currentProject,
    setCurrentProject: handleSetCurrentProject,
    mutate,
    isLoading,
  };
};
