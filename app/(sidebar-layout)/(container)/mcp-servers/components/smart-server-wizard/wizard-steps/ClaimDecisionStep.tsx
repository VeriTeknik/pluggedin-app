'use client';

import { AlertCircle, Check, Github, Loader2,Shield, Users } from 'lucide-react';
import { useCallback,useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getRegistryOAuthToken } from '@/app/actions/registry-oauth-session';
import { verifyGitHubOwnership } from '@/app/actions/registry-servers';
import { useRegistryOAuthSession } from '@/app/hooks/useRegistryOAuthSession';
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
  if (typeof window === 'undefined') return '';
  
  const origin = window.location.origin;
  if (origin.includes('localhost')) {
    return 'Ov23liauuJvy6sLzrDdr'; // Localhost client ID
  } else if (origin.includes('staging')) {
    return 'Ov23liGQCDAID0kY58HE'; // Staging client ID
  } else {
    return '13219bd31987f25b7e34'; // Production client ID
  }
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
  const { t } = useTranslation('registry');
  const [choice, setChoice] = useState<'claim' | 'community' | ''>(
    data.willClaim === true ? 'claim' : data.willClaim === false ? 'community' : ''
  );
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isVerifyingOwnership, setIsVerifyingOwnership] = useState(false);
  const [ownershipVerified, setOwnershipVerified] = useState<boolean | null>(null);
  const [ownershipMessage, setOwnershipMessage] = useState<string>('');
  const { toast } = useToast();
  const { isAuthenticated: hasOAuthSession, githubUsername: sessionUsername, checkSession } = useRegistryOAuthSession();

  // Check if we have a stored OAuth session
  useEffect(() => {
    if (hasOAuthSession && sessionUsername && !data.isAuthenticated) {
      onUpdate({
        isAuthenticated: true,
        githubUsername: sessionUsername,
        registryToken: 'secure_session', // Token is stored securely on server
      });
    }
  }, [hasOAuthSession, sessionUsername, data.isAuthenticated, onUpdate]);

  const initiateGitHubOAuth = () => {
    const clientId = getGitHubClientId();
    const redirectUri = getRedirectUri();
    const scope = 'read:user,read:org';
    // Include state parameter to indicate this is a popup flow
    const state = encodeURIComponent(JSON.stringify({ popup: true, timestamp: Date.now() }));
    const githubOAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    
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
      
      if (event.data.type === 'github-oauth-success' && event.data.githubUsername) {
        // Session is now stored server-side, refresh our session state
        checkSession().then((result) => {
          if (result && result.success) {
            onUpdate({
              isAuthenticated: true,
              githubUsername: result.githubUsername || event.data.githubUsername,
              registryToken: 'secure_session', // Token is stored securely on server
            });
            toast({
              title: t('ownership.claim.authenticated'),
              description: `${t('ownership.claim.authenticated')} @${result.githubUsername || event.data.githubUsername}`,
            });
            
            // After successful authentication, verify ownership
            // We'll use the server-side token for verification
            verifyOwnershipWithSession();
          }
        });
        
        // Clean up
        window.removeEventListener('message', handleMessage);
        if (popup && !popup.closed) {
          popup.close();
        }
        setIsAuthenticating(false);
      } else if (event.data.type === 'github-oauth-error') {
        toast({
          title: t('ownership.claim.authFailed', 'Authentication failed'),
          description: event.data.error || t('common.tryAgain', 'Please try again'),
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
        title: t('ownership.claim.popupBlocked', 'Popup blocked'),
        description: t('ownership.claim.allowPopups', 'Please allow popups for this site to authenticate with GitHub'),
        variant: 'destructive',
      });
      window.removeEventListener('message', handleMessage);
      setIsAuthenticating(false);
    }
  };

  // Verify ownership using secure session
  const verifyOwnershipWithSession = useCallback(async () => {
    if (!data.githubUrl) return;
    
    setIsVerifyingOwnership(true);
    try {
      // Get the OAuth token from secure session
      const sessionResult = await getRegistryOAuthToken();
      if (!sessionResult.success || !sessionResult.oauthToken) {
        throw new Error('No valid session found');
      }
      
      const result = await verifyGitHubOwnership(sessionResult.oauthToken, data.githubUrl);
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

  // Verify ownership of the repository (legacy function for backwards compatibility)
  const verifyOwnership = useCallback(async (token: string) => {
    // This function is kept for backwards compatibility but delegates to the secure version
    await verifyOwnershipWithSession();
  }, [verifyOwnershipWithSession]);

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
    // If server already exists, don't allow proceeding
    if (data.registryCheck?.exists) {
      onUpdate({ willClaim: undefined });
      return;
    }
    
    if (choice === 'community') {
      // Community option is valid when server doesn't exist
      onUpdate({ willClaim: false });
    } else if (choice === 'claim' && data.isAuthenticated && ownershipVerified) {
      // Claim option is valid when authenticated and ownership verified
      onUpdate({ willClaim: true });
    }
  }, [choice, data.isAuthenticated, ownershipVerified, data.registryCheck, onUpdate]);
  
  // Verify ownership when authenticated and claim is selected
  useEffect(() => {
    if (choice === 'claim' && data.isAuthenticated && hasOAuthSession && ownershipVerified === null && data.githubUrl) {
      verifyOwnershipWithSession();
    }
  }, [choice, data.isAuthenticated, hasOAuthSession, ownershipVerified, data.githubUrl, verifyOwnershipWithSession]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">{t('ownership.step.title')}</h2>
        <p className="text-muted-foreground">
          {t('ownership.step.description')}
        </p>
      </div>

      {/* Repository info reminder */}
      <Alert>
        <Github className="h-4 w-4" />
        <AlertDescription>
          <strong>{t('ownership.step.repository')}</strong> {data.owner}/{data.repo}
          {data.repoInfo?.private && (
            <span className="ml-2 text-amber-600 dark:text-amber-500">
              {t('ownership.step.privateRepo')}
            </span>
          )}
        </AlertDescription>
      </Alert>

      {/* Warning if server already exists */}
      {data.registryCheck?.exists && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-semibold mb-2">{t('ownership.step.alreadyExists')}</p>
            {data.registryCheck.servers?.map((server) => (
              <div key={server.id} className="text-sm">
                <p>• {server.name} ({server.isClaimed ? t('ownership.step.claimedServer') : t('ownership.step.communityServer')} server)</p>
                {server.version && <p className="ml-2 text-xs">Version: {server.version}</p>}
              </div>
            ))}
            <p className="mt-2 text-sm">
              {data.registryCheck.servers?.some(s => s.isClaimed) 
                ? t('ownership.step.updateExisting')
                : t('ownership.step.canClaim')}
            </p>
          </AlertDescription>
        </Alert>
      )}

      <RadioGroup value={choice} onValueChange={handleChoiceChange}>
        <div className="space-y-4">
          {/* Claim option */}
          <Card className={choice === 'claim' ? 'ring-2 ring-primary' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-start space-x-3">
                <RadioGroupItem 
                  value="claim" 
                  id="claim" 
                  className="mt-1" 
                  disabled={data.registryCheck?.exists && data.registryCheck.servers?.some(s => s.isClaimed)}
                />
                <div className="flex-1">
                  <Label htmlFor="claim" className="cursor-pointer">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      {t('ownership.claim.title')} {!data.registryCheck?.exists && `(${t('ownership.claim.recommended')})`}
                      {data.registryCheck?.exists && data.registryCheck.servers?.some(s => s.isClaimed) && ` (${t('ownership.claim.alreadyClaimed')})`}
                    </CardTitle>
                  </Label>
                  <CardDescription className="mt-1">
                    {data.registryCheck?.exists && data.registryCheck.servers?.some(s => s.isClaimed) 
                      ? t('ownership.claim.alreadyClaimedDesc')
                      : t('ownership.claim.description')}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  {t('ownership.claim.benefits.analytics')}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  {t('ownership.claim.benefits.priority')}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  {t('ownership.claim.benefits.updates')}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  {t('ownership.claim.benefits.attribution', 'Official ownership attribution')}
                </li>
              </ul>
              
              {choice === 'claim' && (
                <div className="mt-4 space-y-2">
                  {data.isAuthenticated ? (
                    <>
                      <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                        <Check className="h-4 w-4 text-green-600" />
                        <AlertDescription>
                          {t('ownership.claim.authenticated')} <strong>@{data.githubUsername}</strong>
                        </AlertDescription>
                      </Alert>
                      {isVerifyingOwnership && (
                        <Alert>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <AlertDescription>
                            {t('ownership.claim.verifying')}
                          </AlertDescription>
                        </Alert>
                      )}
                      {ownershipVerified === false && (
                        <Alert className={ownershipMessage?.includes("don't have ownership access") 
                          ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950"
                          : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
                        }>
                          <AlertCircle className={`h-4 w-4 ${ownershipMessage?.includes("don't have ownership access") ? "text-blue-600" : "text-amber-600"}`} />
                          <AlertDescription>
                            {ownershipMessage || t('ownership.claim.verificationFailed')}
                          </AlertDescription>
                        </Alert>
                      )}
                      {ownershipVerified === true && (
                        <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                          <Check className="h-4 w-4 text-green-600" />
                          <AlertDescription>
                            {t('ownership.claim.verificationSuccess')}
                          </AlertDescription>
                        </Alert>
                      )}
                    </>
                  ) : (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {t('ownership.claim.authRequired')}
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
                <RadioGroupItem 
                  value="community" 
                  id="community" 
                  className="mt-1" 
                  disabled={data.registryCheck?.exists}
                />
                <div className="flex-1">
                  <Label htmlFor="community" className="cursor-pointer">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      {t('ownership.community.title')}
                      {data.registryCheck?.exists && ` (${t('ownership.community.alreadyInRegistry')})`}
                    </CardTitle>
                  </Label>
                  <CardDescription className="mt-1">
                    {data.registryCheck?.exists 
                      ? t('ownership.community.alreadyInRegistryDesc')
                      : t('ownership.community.description')}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-blue-500" />
                  {t('ownership.community.benefits.quick')}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-blue-500" />
                  {t('ownership.community.benefits.noAuth')}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-blue-500" />
                  {t('ownership.community.benefits.available')}
                </li>
                <li className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  {t('ownership.community.benefits.canBeClaimed')}
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </RadioGroup>

      {/* Action guidance when server exists */}
      {data.registryCheck?.exists && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-semibold">{t('ownership.actions.title')}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {data.registryCheck.servers?.some(s => s.isClaimed) ? (
                <>
                  {t('ownership.actions.ifOwnerClaimed', { returnObjects: true }).map((action: string, index: number) => (
                    <li key={index}>• {action}</li>
                  ))}
                </>
              ) : (
                <>
                  {t('ownership.actions.ifOwnerUnclaimed', { returnObjects: true }).map((action: string, index: number) => (
                    <li key={index}>• {action}</li>
                  ))}
                </>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* The Next button is provided by the wizard footer, so we don't need an extra Continue button here */}
    </div>
  );
}