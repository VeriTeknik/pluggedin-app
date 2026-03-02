'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getProjects } from '@/app/actions/projects';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Project = {
  uuid: string;
  name: string;
};

function AuthorizeContent() {
  const { t } = useTranslation();
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userCode = searchParams.get('code');

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [state, setState] = useState<'loading' | 'ready' | 'submitting' | 'success' | 'denied' | 'expired' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

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
  }, [status, t]);

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

  if (!userCode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('cliAuth.error.title', 'Invalid Request')}</CardTitle>
          <CardDescription>{t('cliAuth.error.noCode', 'No verification code provided.')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (status === 'loading' || state === 'loading') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('cliAuth.title', 'CLI Authorization')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state === 'success') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('cliAuth.success.title', 'Authorization Complete')}</CardTitle>
          <CardDescription>{t('cliAuth.success.message', 'You can close this tab. Your CLI session will be configured automatically.')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (state === 'denied') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('cliAuth.denied.title', 'Authorization Denied')}</CardTitle>
          <CardDescription>{t('cliAuth.denied.message', 'The authorization request was denied. You can close this tab.')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (state === 'expired') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('cliAuth.expired.title', 'Code Expired')}</CardTitle>
          <CardDescription>{t('cliAuth.expired.message', 'This authorization code has expired. Please run the setup command again.')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (state === 'error') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('cliAuth.error.title', 'Error')}</CardTitle>
          <CardDescription>{errorMessage}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" onClick={() => setState('ready')}>
            {t('cliAuth.tryAgain', 'Try Again')}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('cliAuth.title', 'CLI Authorization')}</CardTitle>
        <CardDescription>{t('cliAuth.description', 'A CLI tool is requesting access to your Plugged.in account.')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-2">
            {t('cliAuth.verifyMatch', 'Verify this code matches your terminal:')}
          </p>
          <p className="text-3xl font-mono font-bold tracking-widest">
            {userCode}
          </p>
        </div>

        {projects.length > 1 && (
          <div>
            <label className="text-sm font-medium mb-2 block">
              {t('cliAuth.selectHub', 'Select Hub')}
            </label>
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger>
                <SelectValue placeholder={t('cliAuth.selectHub', 'Select Hub')} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.uuid} value={project.uuid}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleDeny}
          disabled={state === 'submitting'}
        >
          {t('cliAuth.deny', 'Deny')}
        </Button>
        <Button
          className="flex-1"
          onClick={handleAuthorize}
          disabled={state === 'submitting'}
        >
          {state === 'submitting'
            ? t('cliAuth.authorizing', 'Authorizing...')
            : t('cliAuth.authorize', 'Authorize')}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function CliAuthorizePage() {
  return (
    <Suspense fallback={
      <Card>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    }>
      <AuthorizeContent />
    </Suspense>
  );
}
