'use client';

import { Github, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { claimCommunityServer } from '@/app/actions/community-servers';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAnalytics } from '@/hooks/use-analytics';

interface ClaimServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: {
    uuid: string;
    name: string;
    template?: any;
  } | null;
}

// GitHub OAuth configuration
const getGitHubClientId = () => {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin.includes('localhost')) {
      return 'Ov23liauuJvy6sLzrDdr'; // Localhost client ID
    } else if (origin.includes('staging')) {
      return 'Ov23liGQCDAID0kY58HE'; // Staging client ID
    } else {
      return '13219bd31987f25b7e34'; // Production client ID
    }
  }
  return 'Ov23liauuJvy6sLzrDdr'; // Default to localhost
};

export function ClaimServerDialog({ open, onOpenChange, server }: ClaimServerDialogProps) {
  const { t } = useTranslation();
  const { track } = useAnalytics();
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registryToken, setRegistryToken] = useState<string | null>(null);
  const [_isVerifying, _setIsVerifying] = useState(false);

  // Check for OAuth token on mount
  useState(() => {
    const token = localStorage.getItem('registry_oauth_token');
    if (token) {
      setRegistryToken(token);
    }
  });

  const initiateGitHubOAuth = () => {
    const redirectUri = `${window.location.origin}/api/auth/callback/registry`;
    const scope = 'read:user,read:org';
    const githubOAuthUrl = `https://github.com/login/oauth/authorize?client_id=${getGitHubClientId()}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    // Save current state
    localStorage.setItem('claim_server_state', JSON.stringify({
      serverUuid: server?.uuid,
      serverName: server?.name,
      repositoryUrl,
      returnUrl: window.location.pathname + window.location.search,
    }));
    
    window.location.href = githubOAuthUrl;
  };

  const handleClaim = async () => {
    if (!server || !repositoryUrl || !registryToken) {
      toast.error('Please provide all required information');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await claimCommunityServer({
        communityServerUuid: server.uuid,
        repositoryUrl,
        registryToken,
      });

      if (result.success) {
        // Track claim event
        track({
          type: 'claim',
          serverId: server.uuid,
        });
        
        toast.success(result.message || 'Server claimed successfully!');
        onOpenChange(false);
        // Refresh the page to show updated claim status
        window.location.reload();
      } else {
        if (result.needsAuth) {
          toast.error('Please authenticate with GitHub first');
          initiateGitHubOAuth();
        } else {
          toast.error(result.error || 'Failed to claim server');
        }
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
      console.error('Claim error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const extractPackageInfo = () => {
    if (!server?.template) return null;
    
    // Try to extract package name from npx command
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('search.claimDialog.title', 'Claim Community Server')}</DialogTitle>
          <DialogDescription>
            {t('search.claimDialog.description', 'Prove ownership of this server by providing the GitHub repository URL')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t('search.claimDialog.serverName', 'Server Name')}</Label>
            <div className="text-sm text-muted-foreground">{server?.name}</div>
          </div>

          {packageName && (
            <div className="space-y-2">
              <Label>{t('search.claimDialog.packageName', 'Package Name')}</Label>
              <div className="text-sm text-muted-foreground font-mono">{packageName}</div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="repository-url">
              {t('search.claimDialog.repositoryUrl', 'GitHub Repository URL')}
            </Label>
            <Input
              id="repository-url"
              type="url"
              placeholder="https://github.com/owner/repo"
              value={repositoryUrl}
              onChange={(e) => setRepositoryUrl(e.target.value)}
              disabled={isSubmitting}
            />
            <p className="text-sm text-muted-foreground">
              {t('search.claimDialog.repositoryHelp', 'Enter the GitHub repository URL that publishes this package')}
            </p>
          </div>

          {!registryToken && (
            <Alert>
              <AlertDescription>
                {t('search.claimDialog.authRequired', 'You need to authenticate with GitHub to verify ownership')}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          
          {!registryToken ? (
            <Button onClick={initiateGitHubOAuth} disabled={isSubmitting}>
              <Github className="mr-2 h-4 w-4" />
              {t('search.claimDialog.authenticate', 'Authenticate with GitHub')}
            </Button>
          ) : (
            <Button 
              onClick={handleClaim} 
              disabled={isSubmitting || !repositoryUrl}
            >
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}