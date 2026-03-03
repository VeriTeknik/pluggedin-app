'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { USER_CODE_PATTERN } from '@/lib/cli-auth-constants';

import { type Project, useCliAuthorize } from './use-cli-authorize';

function LoadingCard() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('cliAuth.title', 'CLI Authorization')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-label="Loading" role="status" />
        </div>
      </CardContent>
    </Card>
  );
}

function NoCodeCard() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('cliAuth.error.invalidRequest', 'Invalid Request')}</CardTitle>
        <CardDescription>{t('cliAuth.error.noCode', 'No verification code provided.')}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function SuccessCard() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('cliAuth.success.title', 'Authorization Complete')}</CardTitle>
        <CardDescription>{t('cliAuth.success.message', 'You can close this tab. Your CLI session will be configured automatically.')}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function DeniedCard() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('cliAuth.denied.title', 'Authorization Denied')}</CardTitle>
        <CardDescription>{t('cliAuth.denied.message', 'The authorization request was denied. You can close this tab.')}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function ExpiredCard() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('cliAuth.expired.title', 'Code Expired')}</CardTitle>
        <CardDescription>{t('cliAuth.expired.message', 'This authorization code has expired. Please run the setup command again.')}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('cliAuth.error.title', 'Error')}</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button variant="outline" onClick={onRetry}>
          {t('cliAuth.tryAgain', 'Try Again')}
        </Button>
      </CardFooter>
    </Card>
  );
}

type MainFormCardProps = {
  userCode: string;
  projects: Project[];
  selectedProject: string;
  onProjectChange: (uuid: string) => void;
  onAuthorize: () => void;
  onDeny: () => void;
  submitting: boolean;
};

function MainFormCard({
  userCode,
  projects,
  selectedProject,
  onProjectChange,
  onAuthorize,
  onDeny,
  submitting,
}: MainFormCardProps) {
  const { t } = useTranslation();

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
            <Select value={selectedProject} onValueChange={onProjectChange}>
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
          onClick={onDeny}
          disabled={submitting}
        >
          {t('cliAuth.deny', 'Deny')}
        </Button>
        <Button
          className="flex-1"
          onClick={onAuthorize}
          disabled={submitting}
        >
          {submitting
            ? t('cliAuth.authorizing', 'Authorizing...')
            : t('cliAuth.authorize', 'Authorize')}
        </Button>
      </CardFooter>
    </Card>
  );
}

function AuthorizeContent() {
  const searchParams = useSearchParams();
  const userCode = searchParams.get('code');
  const isValidFormat = userCode && USER_CODE_PATTERN.test(userCode);

  // Pass null when format is invalid to avoid unnecessary session/project fetches.
  // Hook is always called (Rules of Hooks) but skips side effects when null.
  const {
    sessionStatus,
    state,
    errorMessage,
    projects,
    selectedProject,
    setSelectedProject,
    handleAuthorize,
    handleDeny,
    handleRetry,
  } = useCliAuthorize(isValidFormat ? userCode : null);

  if (!isValidFormat) return <NoCodeCard />;
  if (sessionStatus === 'loading' || state === 'loading') return <LoadingCard />;
  if (state === 'success') return <SuccessCard />;
  if (state === 'denied') return <DeniedCard />;
  if (state === 'expired') return <ExpiredCard />;
  if (state === 'error') return <ErrorCard message={errorMessage} onRetry={handleRetry} />;

  return (
    <MainFormCard
      userCode={userCode}
      projects={projects}
      selectedProject={selectedProject}
      onProjectChange={setSelectedProject}
      onAuthorize={handleAuthorize}
      onDeny={handleDeny}
      submitting={state === 'submitting'}
    />
  );
}

export default function CliAuthorizePage() {
  return (
    <Suspense fallback={
      <Card>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-label="Loading" role="status" />
          </div>
        </CardContent>
      </Card>
    }>
      <AuthorizeContent />
    </Suspense>
  );
}
