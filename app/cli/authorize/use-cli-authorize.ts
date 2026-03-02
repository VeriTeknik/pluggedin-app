'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getProjects } from '@/app/actions/projects';

export type CliAuthState =
  | 'loading'
  | 'ready'
  | 'submitting'
  | 'success'
  | 'denied'
  | 'expired'
  | 'error';

export type Project = {
  uuid: string;
  name: string;
};

export type UseCliAuthorizeResult = {
  sessionStatus: string;
  state: CliAuthState;
  errorMessage: string;
  projects: Project[];
  selectedProject: string;
  setSelectedProject: (uuid: string) => void;
  handleAuthorize: () => Promise<void>;
  handleDeny: () => Promise<void>;
  handleRetry: () => void;
};

export function useCliAuthorize(userCode: string | null): UseCliAuthorizeResult {
  const { t } = useTranslation();
  const { status } = useSession();
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [state, setState] = useState<CliAuthState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [retryToken, setRetryToken] = useState(0);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      const callbackUrl = encodeURIComponent(`/cli/authorize?code=${userCode || ''}`);
      router.push(`/login?callbackUrl=${callbackUrl}`);
    }
  }, [status, router, userCode]);

  // Fetch user's projects (Hubs)
  useEffect(() => {
    if (status !== 'authenticated') return;

    async function fetchProjects() {
      try {
        const result = await getProjects();
        if (result && Array.isArray(result)) {
          const projectList = result.map((p: { uuid: string; name: string }) => ({
            uuid: p.uuid,
            name: p.name,
          }));
          setProjects(projectList);
          if (projectList.length > 0) {
            setSelectedProject(projectList[0].uuid);
          }
          setState('ready');
        }
      } catch {
        setState('error');
        setErrorMessage(t('cliAuth.error.loadProjects', 'Failed to load your Hubs'));
      }
    }

    fetchProjects();
  }, [status, t, retryToken]);

  const handleAuthorize = useCallback(async () => {
    if (!userCode) return;
    setState('submitting');

    try {
      const res = await fetch('/api/cli/auth/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_code: userCode,
          project_uuid: selectedProject || undefined,
        }),
      });

      if (res.ok) {
        setState('success');
      } else {
        const data = await res.json();
        if (data.code === 'EXPIRED') {
          setState('expired');
        } else if (data.code === 'NO_HUB') {
          setState('error');
          setErrorMessage(t('cliAuth.error.noHubs', 'No Hubs found. Please create a Hub first.'));
        } else {
          setState('error');
          setErrorMessage(data.error || t('cliAuth.error.generic', 'Authorization failed'));
        }
      }
    } catch {
      setState('error');
      setErrorMessage(t('cliAuth.error.generic', 'Authorization failed'));
    }
  }, [userCode, selectedProject, t]);

  const handleDeny = useCallback(async () => {
    if (!userCode) return;
    setState('submitting');

    try {
      const res = await fetch('/api/cli/auth/deny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_code: userCode }),
      });

      if (res.ok) {
        setState('denied');
      } else {
        const data = await res.json();
        if (data.code === 'EXPIRED') {
          setState('expired');
        } else {
          setState('error');
          setErrorMessage(data.error || t('cliAuth.error.generic', 'Request failed'));
        }
      }
    } catch {
      setState('error');
      setErrorMessage(t('cliAuth.error.generic', 'Request failed'));
    }
  }, [userCode, t]);

  const handleRetry = useCallback(() => {
    setState('loading');
    setRetryToken(prev => prev + 1);
  }, []);

  return {
    sessionStatus: status,
    state,
    errorMessage,
    projects,
    selectedProject,
    setSelectedProject,
    handleAuthorize,
    handleDeny,
    handleRetry,
  };
}
