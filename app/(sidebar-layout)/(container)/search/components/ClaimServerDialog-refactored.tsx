'use client';

import { Github, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

import { zodResolver } from '@hookform/resolvers/zod';

import { claimCommunityServer } from '@/app/actions/community-servers';
import { checkUserGitHubConnection } from '@/app/actions/registry-servers';
import { BaseDialog } from '@/components/ui/base-dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAsyncForm } from '@/hooks/use-async-form';
import { urlSchema } from '@/lib/form-validators';
import { handleError } from '@/lib/error-handler';

interface ClaimServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: {
    uuid: string;
    name: string;
    template?: any;
  } | null;
}

const claimServerSchema = z.object({
  repositoryUrl: urlSchema.refine(
    (url) => url.includes('github.com'),
    'Must be a GitHub repository URL'
  ),
});

type ClaimServerForm = z.infer<typeof claimServerSchema>;

export function ClaimServerDialogRefactored({ open, onOpenChange, server }: ClaimServerDialogProps) {
  const { t } = useTranslation();
  const [hasGitHub, setHasGitHub] = useState(false);
  const [githubUsername, setGithubUsername] = useState<string | null>(null);
  const [isCheckingGitHub, setIsCheckingGitHub] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const form = useForm<ClaimServerForm>({
    resolver: zodResolver(claimServerSchema),
    defaultValues: {
      repositoryUrl: '',
    },
  });

  const { handleSubmit, isSubmitting } = useAsyncForm(
    form,
    async (data) => {
      if (!server) {
        return { success: false, error: 'No server selected' };
      }

      if (!hasGitHub) {
        return { success: false, error: 'Please connect your GitHub account first' };
      }

      const registryToken = localStorage.getItem('registry_oauth_token') || 'nextauth';

      const result = await claimCommunityServer({
        communityServerUuid: server.uuid,
        repositoryUrl: data.repositoryUrl,
        registryToken,
      });

      if (result.success && window.location.pathname === '/search') {
        window.dispatchEvent(
          new CustomEvent('server-claimed', {
            detail: {
              serverUuid: server.uuid,
              published: result.published || false,
            },
          })
        );
      }

      return result;
    },
    {
      onSuccess: () => {
        onOpenChange(false);
      },
      successMessage: 'Server claimed successfully!',
      errorMessage: 'Failed to claim server',
    }
  );

  useEffect(() => {
    if (open) {
      checkGitHub();
      restoreState();
    }
  }, [open, server?.uuid]);

  const checkGitHub = async () => {
    setIsCheckingGitHub(true);
    try {
      const registryToken = localStorage.getItem('registry_oauth_token');
      if (registryToken) {
        const response = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${registryToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        });

        if (response.ok) {
          const userData = await response.json();
          setHasGitHub(true);
          setGithubUsername(userData.login);
          return;
        } else {
          localStorage.removeItem('registry_oauth_token');
        }
      }

      const result = await checkUserGitHubConnection();
      setHasGitHub(result.hasGitHub);
      setGithubUsername(result.githubUsername || null);
    } catch (error) {
      handleError(error, { showToast: false });
      setHasGitHub(false);
    } finally {
      setIsCheckingGitHub(false);
    }
  };

  const restoreState = () => {
    const savedState = localStorage.getItem('claim_server_state');
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        if (state.repositoryUrl && state.serverUuid === server?.uuid) {
          form.setValue('repositoryUrl', state.repositoryUrl);
        }
        if (Date.now() - state.timestamp > 5 * 60 * 1000) {
          localStorage.removeItem('claim_server_state');
        }
      } catch {
        localStorage.removeItem('claim_server_state');
      }
    }
  };

  const handleGitHubSignIn = async () => {
    setIsAuthenticating(true);

    const claimState = {
      serverUuid: server?.uuid,
      serverName: server?.name,
      repositoryUrl: form.getValues('repositoryUrl'),
      returnUrl: window.location.pathname + window.location.search,
      timestamp: Date.now(),
    };
    localStorage.setItem('claim_server_state', JSON.stringify(claimState));

    const getGitHubClientId = () => {
      const origin = window.location.origin;
      if (origin.includes('localhost')) {
        return 'Ov23liauuJvy6sLzrDdr';
      } else if (origin.includes('staging')) {
        return 'Ov23liGQCDAID0kY58HE';
      } else {
        return '13219bd31987f25b7e34';
      }
    };

    const GITHUB_CLIENT_ID = getGitHubClientId();
    const redirectUri = `${window.location.origin}/api/auth/callback/registry`;
    const scope = 'read:user,read:org';
    const githubOAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=${encodeURIComponent(
      scope
    )}&redirect_uri=${encodeURIComponent(redirectUri)}`;

    window.location.href = githubOAuthUrl;
  };

  const extractPackageInfo = () => {
    if (!server?.template) return null;

    if (server.template.command === 'npx' && server.template.args?.[0]) {
      const packageName = server.template.args[0]
        .replace('-y', '')
        .replace('@latest', '')
        .trim();
      return packageName;
    }

    return null;
  };

  const packageName = extractPackageInfo();

  const footer = (
    <>
      <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
        {t('common.cancel', 'Cancel')}
      </Button>

      {isCheckingGitHub ? (
        <Button disabled>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t('common.loading', 'Loading...')}
        </Button>
      ) : !hasGitHub ? (
        <Button onClick={handleGitHubSignIn} disabled={isSubmitting || isAuthenticating}>
          {isAuthenticating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('search.claimDialog.authenticating', 'Authenticating...')}
            </>
          ) : (
            <>
              <Github className="mr-2 h-4 w-4" />
              {t('search.claimDialog.connectGitHub', 'Connect GitHub Account')}
            </>
          )}
        </Button>
      ) : (
        <Button type="submit" form="claim-server-form" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('search.claimDialog.claiming', 'Claiming...')}
            </>
          ) : (
            t('search.claimDialog.claimButton', 'Claim Server')
          )}
        </Button>
      )}
    </>
  );

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('search.claimDialog.title', 'Claim Community Server')}
      description={t(
        'search.claimDialog.description',
        'Prove ownership of this server by providing the GitHub repository URL'
      )}
      footer={footer}
    >
      <Form {...form}>
        <form id="claim-server-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <FormLabel>{t('search.claimDialog.serverName', 'Server Name')}</FormLabel>
            <div className="text-sm text-muted-foreground">{server?.name}</div>
          </div>

          {packageName && (
            <div className="space-y-2">
              <FormLabel>{t('search.claimDialog.packageName', 'Package Name')}</FormLabel>
              <div className="text-sm text-muted-foreground font-mono">{packageName}</div>
            </div>
          )}

          <FormField
            control={form.control}
            name="repositoryUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('search.claimDialog.repositoryUrl', 'GitHub Repository URL')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="url"
                    placeholder="https://github.com/owner/repo"
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'search.claimDialog.repositoryHelp',
                    'Enter the GitHub repository URL that publishes this package'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {isCheckingGitHub ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            !hasGitHub && (
              <Alert>
                <AlertDescription>
                  {t(
                    'search.claimDialog.authRequired',
                    'You need to connect your GitHub account to claim this server'
                  )}
                </AlertDescription>
              </Alert>
            )
          )}

          {hasGitHub && githubUsername && (
            <div className="space-y-2">
              <FormLabel>{t('search.claimDialog.githubAccount', 'GitHub Account')}</FormLabel>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Github className="h-4 w-4" />
                <span>{githubUsername}</span>
              </div>
            </div>
          )}
        </form>
      </Form>
    </BaseDialog>
  );
}