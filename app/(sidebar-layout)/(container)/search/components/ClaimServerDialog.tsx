'use client';

import { Github, Loader2 } from 'lucide-react';
import { useEffect,useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { claimCommunityServer } from '@/app/actions/community-servers';
import { checkUserGitHubConnection } from '@/app/actions/registry-servers';
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

interface ClaimServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: {
    uuid: string;
    name: string;
    template?: any;
  } | null;
}

// No longer need custom GitHub OAuth configuration - using NextAuth

export function ClaimServerDialog({ open, onOpenChange, server }: ClaimServerDialogProps) {
  const { t } = useTranslation();
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasGitHub, setHasGitHub] = useState(false);
  const [githubUsername, setGithubUsername] = useState<string | null>(null);
  const [isCheckingGitHub, setIsCheckingGitHub] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Check for GitHub connection on mount and restore state if coming back from OAuth
  useEffect(() => {
    if (open) {
      checkGitHub();
      
      // Check if we're returning from OAuth flow
      const savedState = localStorage.getItem('claim_server_state');
      if (savedState) {
        try {
          const state = JSON.parse(savedState);
          // Restore repository URL if it was saved
          if (state.repositoryUrl && state.serverUuid === server?.uuid) {
            setRepositoryUrl(state.repositoryUrl);
          }
          // Clean up saved state if it's older than 5 minutes
          if (Date.now() - state.timestamp > 5 * 60 * 1000) {
            localStorage.removeItem('claim_server_state');
          }
        } catch (e) {
          console.error('Error restoring claim state:', e);
          localStorage.removeItem('claim_server_state');
        }
      }
    }
  }, [open, server?.uuid]);

  const handleGitHubSignIn = async () => {
    setIsAuthenticating(true);
    
    // Save the current state before redirecting
    const claimState = {
      serverUuid: server?.uuid,
      serverName: server?.name,
      repositoryUrl,
      returnUrl: window.location.pathname + window.location.search,
      timestamp: Date.now()
    };
    localStorage.setItem('claim_server_state', JSON.stringify(claimState));
    
    // Get GitHub client ID based on environment
    const getGitHubClientId = () => {
      const origin = window.location.origin;
      if (origin.includes('localhost')) {
        return 'Ov23liauuJvy6sLzrDdr'; // Localhost client ID
      } else if (origin.includes('staging')) {
        return 'Ov23liGQCDAID0kY58HE'; // Staging client ID
      } else {
        return '13219bd31987f25b7e34'; // Production client ID
      }
    };
    
    const GITHUB_CLIENT_ID = getGitHubClientId();
    const redirectUri = `${window.location.origin}/api/auth/callback/registry`;
    const scope = 'read:user,read:org';
    const githubOAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    // Redirect to GitHub OAuth
    window.location.href = githubOAuthUrl;
  };
  
  const checkGitHub = async () => {
    setIsCheckingGitHub(true);
    try {
      // First check if we have a registry OAuth token
      const registryToken = localStorage.getItem('registry_oauth_token');
      if (registryToken) {
        // Verify the token with GitHub API
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
          // Token is invalid, remove it
          localStorage.removeItem('registry_oauth_token');
        }
      }
      
      // Fall back to checking NextAuth connection
      const result = await checkUserGitHubConnection();
      setHasGitHub(result.hasGitHub);
      setGithubUsername(result.githubUsername || null);
    } catch (error) {
      console.error('Error checking GitHub connection:', error);
      setHasGitHub(false);
    } finally {
      setIsCheckingGitHub(false);
    }
  };

  const handleClaim = async () => {
    if (!server || !repositoryUrl) {
      toast.error('Please provide a repository URL');
      return;
    }

    if (!hasGitHub) {
      toast.error('Please connect your GitHub account first');
      return;
    }

    setIsSubmitting(true);
    try {
      // Use registry OAuth token if available, otherwise the backend will use NextAuth token
      const registryToken = localStorage.getItem('registry_oauth_token') || 'nextauth';
      
      const result = await claimCommunityServer({
        communityServerUuid: server.uuid,
        repositoryUrl,
        registryToken, // Pass the registry OAuth token
      });

      if (result.success) {
        // Analytics tracking removed - will be replaced with new analytics service
        
        // Show appropriate message based on whether it was published
        if (result.warning) {
          toast.warning(result.message || 'Server claimed but not published');
        } else {
          toast.success(result.message || 'Server claimed and published successfully!');
        }
        
        onOpenChange(false);
        // Trigger a refresh of search results without reloading the page
        // The parent component should handle this via onRefreshNeeded prop
        if (window.location.pathname === '/search') {
          // Dispatch a custom event that the search page can listen to
          window.dispatchEvent(new CustomEvent('server-claimed', { 
            detail: { 
              serverUuid: server.uuid,
              published: result.published || false
            }
          }));
        }
      } else {
        if (result.needsAuth) {
          toast.error('Please authenticate with GitHub first');
          handleGitHubSignIn();
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

          {isCheckingGitHub ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !hasGitHub && (
            <Alert>
              <AlertDescription>
                {t('search.claimDialog.authRequired', 'You need to connect your GitHub account to claim this server')}
              </AlertDescription>
            </Alert>
          )}
          
          {hasGitHub && githubUsername && (
            <div className="space-y-2">
              <Label>{t('search.claimDialog.githubAccount', 'GitHub Account')}</Label>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Github className="h-4 w-4" />
                <span>{githubUsername}</span>
              </div>
            </div>
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