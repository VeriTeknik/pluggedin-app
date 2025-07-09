'use client';

import { AlertCircle, Check, Github, Loader2,Shield, Users } from 'lucide-react';
import { useCallback,useEffect, useState } from 'react';

import { verifyGitHubOwnership } from '@/app/actions/registry-servers';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';

import { WizardData } from '../useWizardState';

interface ClaimDecisionStepProps {
  data: WizardData;
  onUpdate: (updates: Partial<WizardData>) => void;
}

// GitHub OAuth configuration
const getGitHubClientId = () => {
  return process.env.GITHUB_CLIENT_ID || '';
};

const getRedirectUri = () => {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    const baseUrl = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    return `${baseUrl}/api/auth/callback/registry`;
  }
  return '';
};

export function ClaimDecisionStep({ data, onUpdate }: ClaimDecisionStepProps) {
  const [choice, setChoice] = useState<'claim' | 'community' | ''>(
    data.willClaim === true ? 'claim' : data.willClaim === false ? 'community' : ''
  );
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isVerifyingOwnership, setIsVerifyingOwnership] = useState(false);
  const [ownershipVerified, setOwnershipVerified] = useState<boolean | null>(null);
  const [ownershipMessage, setOwnershipMessage] = useState<string>('');
  const { toast } = useToast();

  // Check if we have a stored token
  useEffect(() => {
    const token = localStorage.getItem('registry_oauth_token');
    if (token && !data.isAuthenticated) {
      // Verify the token and get user info
      fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })
        .then(res => res.json())
        .then(user => {
          if (user.login) {
            console.log('🔍 ClaimDecisionStep: Storing registry token from localStorage:', token ? `${token.substring(0, 10)}...` : 'undefined');
            onUpdate({
              isAuthenticated: true,
              githubUsername: user.login,
              registryToken: token,
            });
          }
        })
        .catch(() => {
          // Token is invalid, remove it
          localStorage.removeItem('registry_oauth_token');
        });
    }
  }, [data.isAuthenticated, onUpdate]);

  const initiateGitHubOAuth = () => {
    const clientId = getGitHubClientId();
    const redirectUri = getRedirectUri();
    const scope = 'read:user,read:org';
    const githubOAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    setIsAuthenticating(true);
    
    // Open OAuth in a popup window
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    
    const popup = window.open(
      githubOAuthUrl,
      'github-oauth',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
    );
    
    // Listen for messages from the popup
    const handleMessage = (event: MessageEvent) => {
      // Verify origin for security
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'github-oauth-success' && event.data.accessToken) {
        // Store token in localStorage
        localStorage.setItem('registry_oauth_token', event.data.accessToken);
        
        // Get GitHub username
        fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${event.data.accessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        })
          .then(res => res.json())
          .then(user => {
            if (user.login) {
              console.log('🔍 ClaimDecisionStep: Storing registry token from OAuth popup:', event.data.accessToken ? `${event.data.accessToken.substring(0, 10)}...` : 'undefined');
              onUpdate({
                isAuthenticated: true,
                githubUsername: user.login,
                registryToken: event.data.accessToken,
              });
              toast({
                title: 'Authentication successful',
                description: `Authenticated as @${user.login}`,
              });
              
              // After successful authentication, verify ownership
              verifyOwnership(event.data.accessToken);
            }
          })
          .catch(console.error);
        
        // Clean up
        window.removeEventListener('message', handleMessage);
        if (popup && !popup.closed) {
          popup.close();
        }
        setIsAuthenticating(false);
      } else if (event.data.type === 'github-oauth-error') {
        toast({
          title: 'Authentication failed',
          description: event.data.error || 'Please try again',
          variant: 'destructive',
        });
        window.removeEventListener('message', handleMessage);
        setIsAuthenticating(false);
      }
    };
    
    window.addEventListener('message', handleMessage);
    
    // Check if popup was blocked
    if (!popup || popup.closed) {
      toast({
        title: 'Popup blocked',
        description: 'Please allow popups for this site to authenticate with GitHub',
        variant: 'destructive',
      });
      window.removeEventListener('message', handleMessage);
      setIsAuthenticating(false);
    }
  };

  // Verify ownership of the repository
  const verifyOwnership = useCallback(async (token: string) => {
    if (!data.githubUrl) return;
    
    setIsVerifyingOwnership(true);
    try {
      const result = await verifyGitHubOwnership(token, data.githubUrl);
      setOwnershipVerified(result.isOwner);
      setOwnershipMessage(result.reason || '');
      onUpdate({ ownershipVerified: result.isOwner });
      
      if (!result.isOwner) {
        toast({
          title: 'Ownership verification failed',
          description: result.reason || 'You do not have admin access to this repository',
          variant: 'destructive',
        });
        // Reset to community choice if not owner
        setChoice('community');
        onUpdate({ willClaim: false });
      }
    } catch (error) {
      console.error('Error verifying ownership:', error);
      toast({
        title: 'Verification error',
        description: 'Could not verify repository ownership',
        variant: 'destructive',
      });
    } finally {
      setIsVerifyingOwnership(false);
    }
  }, [data.githubUrl, toast, onUpdate]);

  const handleChoiceChange = (value: string) => {
    setChoice(value as 'claim' | 'community');
    
    if (value === 'community') {
      onUpdate({ willClaim: false });
    } else if (value === 'claim') {
      onUpdate({ willClaim: true });
      
      // If not authenticated, initiate OAuth
      if (!data.isAuthenticated) {
        initiateGitHubOAuth();
      }
    }
  };

  // Update the completion state when choice changes
  useEffect(() => {
    if (choice === 'community') {
      // Community option is always valid
      onUpdate({ willClaim: false });
    } else if (choice === 'claim' && data.isAuthenticated && ownershipVerified) {
      // Claim option is valid when authenticated and ownership verified
      onUpdate({ willClaim: true });
    }
  }, [choice, data.isAuthenticated, ownershipVerified, onUpdate]);
  
  // Verify ownership when authenticated and claim is selected
  useEffect(() => {
    const token = localStorage.getItem('registry_oauth_token');
    if (choice === 'claim' && data.isAuthenticated && token && ownershipVerified === null && data.githubUrl) {
      verifyOwnership(token);
    }
  }, [choice, data.isAuthenticated, ownershipVerified, data.githubUrl, verifyOwnership]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Server Ownership</h2>
        <p className="text-muted-foreground">
          Choose how you want to add this server to the registry.
        </p>
      </div>

      {/* Repository info reminder */}
      <Alert>
        <Github className="h-4 w-4" />
        <AlertDescription>
          <strong>Repository:</strong> {data.owner}/{data.repo}
          {data.repoInfo?.private && (
            <span className="ml-2 text-amber-600 dark:text-amber-500">
              (Private repository)
            </span>
          )}
        </AlertDescription>
      </Alert>

      <RadioGroup value={choice} onValueChange={handleChoiceChange}>
        <div className="space-y-4">
          {/* Claim option */}
          <Card className={choice === 'claim' ? 'ring-2 ring-primary' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-start space-x-3">
                <RadioGroupItem value="claim" id="claim" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="claim" className="cursor-pointer">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      Claim this server (Recommended)
                    </CardTitle>
                  </Label>
                  <CardDescription className="mt-1">
                    Verify ownership and unlock premium features
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Verified badge on your server
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Access to analytics and insights
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Priority in search results
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Direct registry updates from GitHub
                </li>
              </ul>
              
              {choice === 'claim' && (
                <div className="mt-4 space-y-2">
                  {data.isAuthenticated ? (
                    <>
                      <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                        <Check className="h-4 w-4 text-green-600" />
                        <AlertDescription>
                          Authenticated as <strong>@{data.githubUsername}</strong>
                        </AlertDescription>
                      </Alert>
                      {isVerifyingOwnership && (
                        <Alert>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <AlertDescription>
                            Verifying repository ownership...
                          </AlertDescription>
                        </Alert>
                      )}
                      {ownershipVerified === false && (
                        <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
                          <AlertCircle className="h-4 w-4 text-amber-600" />
                          <AlertDescription>
                            {ownershipMessage || 'You do not have admin access to this repository. Please select "Add to community" instead.'}
                          </AlertDescription>
                        </Alert>
                      )}
                      {ownershipVerified === true && (
                        <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                          <Check className="h-4 w-4 text-green-600" />
                          <AlertDescription>
                            Repository ownership verified!
                          </AlertDescription>
                        </Alert>
                      )}
                    </>
                  ) : (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        GitHub authentication is required to claim servers
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Community option */}
          <Card className={choice === 'community' ? 'ring-2 ring-primary' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-start space-x-3">
                <RadioGroupItem value="community" id="community" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="community" className="cursor-pointer">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Add to community
                    </CardTitle>
                  </Label>
                  <CardDescription className="mt-1">
                    Submit without ownership verification
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-blue-500" />
                  Quick submission process
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-blue-500" />
                  No authentication required
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-blue-500" />
                  Available to all users
                </li>
                <li className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  Can be claimed later by the owner
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </RadioGroup>

      {/* The Next button is provided by the wizard footer, so we don't need an extra Continue button here */}
    </div>
  );
}