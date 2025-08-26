'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Server, Database, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

function OAuthAuthorizeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  
  const clientId = searchParams.get('client_id') || '';
  const clientName = searchParams.get('client_name') || 'Unknown Application';
  const redirectUri = searchParams.get('redirect_uri') || '';
  const scope = searchParams.get('scope') || 'mcp:read mcp:execute';
  const state = searchParams.get('state');
  const profileUuid = searchParams.get('profile_uuid') || '';
  const profileName = searchParams.get('profile_name') || 'Default Profile';
  const projectName = searchParams.get('project_name') || 'Default Project';
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method');

  const scopes = scope.split(' ');
  const isPopup = searchParams.get('popup') === 'true';

  const handleAuthorization = async (approved: boolean) => {
    setIsAuthorizing(true);
    
    try {
      const response = await fetch('/api/oauth/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          approved,
          clientId,
          redirectUri,
          scope,
          state,
          profileUuid,
          codeChallenge,
          codeChallengeMethod,
        }),
      });

      const data = await response.json();
      
      if (data.redirectUrl) {
        if (isPopup) {
          // For popup mode, post message to opener
          window.opener?.postMessage({
            type: 'oauth-success',
            code: new URL(data.redirectUrl).searchParams.get('code'),
            state: new URL(data.redirectUrl).searchParams.get('state'),
          }, '*');
          window.close();
        } else {
          // Redirect to the callback URL
          window.location.href = data.redirectUrl;
        }
      } else if (data.error) {
        alert(`Error: ${data.error_description || data.error}`);
      }
    } catch (error) {
      console.error('Authorization error:', error);
      alert('An error occurred during authorization');
    } finally {
      setIsAuthorizing(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl">Authorize Application</CardTitle>
            <Shield className="h-6 w-6 text-green-500" />
          </div>
          <CardDescription>
            Review and approve access request
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>{clientName}</strong> wants to access your Plugged.in MCP servers
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-semibold mb-1">Account:</p>
              <p className="text-sm text-muted-foreground">
                {projectName} / {profileName}
              </p>
            </div>

            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-semibold mb-2">This will allow the application to:</p>
              <ul className="space-y-2">
                {scopes.includes('mcp:read') && (
                  <li className="flex items-start gap-2">
                    <Database className="h-4 w-4 mt-0.5 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium">Read MCP server information</p>
                      <p className="text-xs text-muted-foreground">
                        View your configured MCP servers and their capabilities
                      </p>
                    </div>
                  </li>
                )}
                {scopes.includes('mcp:execute') && (
                  <li className="flex items-start gap-2">
                    <Server className="h-4 w-4 mt-0.5 text-orange-500" />
                    <div>
                      <p className="text-sm font-medium">Execute MCP tools</p>
                      <p className="text-xs text-muted-foreground">
                        Run tools and commands on your behalf through MCP servers
                      </p>
                    </div>
                  </li>
                )}
              </ul>
            </div>

            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-xs text-yellow-800 dark:text-yellow-200">
                <strong>Security Note:</strong> Only authorize applications you trust. 
                This application will have access to execute actions through your MCP servers.
              </p>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => handleAuthorization(false)}
            disabled={isAuthorizing}
          >
            Deny
          </Button>
          <Button
            className="flex-1"
            onClick={() => handleAuthorization(true)}
            disabled={isAuthorizing}
          >
            {isAuthorizing ? 'Authorizing...' : 'Authorize'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function OAuthAuthorizePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full">
          <CardContent className="p-6">
            <div className="text-center">Loading...</div>
          </CardContent>
        </Card>
      </div>
    }>
      <OAuthAuthorizeContent />
    </Suspense>
  );
}