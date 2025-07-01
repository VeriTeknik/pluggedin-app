'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Copy, Github, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function TestRegistryAuthPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [publishData, setPublishData] = useState({
    name: 'io.github.yourusername/test-server',
    description: 'Test server for registry authentication',
    version: '1.0.0',
    repoUrl: 'https://github.com/yourusername/test-server'
  });

  // GitHub OAuth configuration
  const GITHUB_CLIENT_ID = 'Ov23liGQCDAID0kY58HE';
  const REDIRECT_URI = 'http://localhost:12005/test-registry-auth';
  const GITHUB_OAUTH_URL = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=read:user,read:org&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

  const handleOAuthCallback = async (code: string) => {
    setIsLoading(true);
    try {
      // Exchange code for token
      const response = await fetch('/api/auth/github-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirect_uri: REDIRECT_URI })
      });

      const data = await response.json();
      
      if (data.access_token) {
        setAccessToken(data.access_token);
        toast.success('Successfully authenticated with GitHub!');
        
        // Clean up URL
        window.history.replaceState({}, document.title, '/test-registry-auth');
      } else {
        toast.error(data.error || 'Failed to get access token');
      }
    } catch (error) {
      console.error('OAuth callback error:', error);
      toast.error('Failed to process OAuth callback');
    } finally {
      setIsLoading(false);
    }
  };

  // Check for OAuth callback on page load
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
      handleOAuthCallback(code);
    }
  }, []);

  const initiateOAuth = () => {
    window.location.href = GITHUB_OAUTH_URL;
  };

  const copyToken = () => {
    navigator.clipboard.writeText(accessToken);
    toast.success('Token copied to clipboard!');
  };

  const testPublish = async () => {
    if (!accessToken) {
      toast.error('Please authenticate first');
      return;
    }

    setIsLoading(true);
    setTestResult(null);

    try {
      const payload = {
        name: publishData.name,
        description: publishData.description,
        version_detail: {
          version: publishData.version
        },
        packages: [{
          registry_name: 'npm',
          name: publishData.name.replace('io.github.', '@'),
          version: publishData.version
        }],
        repository: {
          url: publishData.repoUrl,
          source: 'github',
          id: publishData.repoUrl.replace('https://github.com/', '')
        }
      };

      const response = await fetch('https://registry.plugged.in/v0/publish', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.text();
      
      if (response.ok) {
        setTestResult({ 
          success: true, 
          message: `Success! Response: ${result}` 
        });
        toast.success('Successfully published to registry!');
      } else {
        setTestResult({ 
          success: false, 
          message: `Failed (${response.status}): ${result}` 
        });
        toast.error(`Publishing failed: ${response.status}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setTestResult({ success: false, message: errorMessage });
      toast.error('Failed to publish to registry');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container max-w-4xl mx-auto py-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-6 w-6" />
            Registry GitHub OAuth Test
          </CardTitle>
          <CardDescription>
            Test GitHub OAuth flow to get access tokens for registry publishing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: OAuth Authentication */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Step 1: Authenticate with GitHub</h3>
            
            {!accessToken ? (
              <Button 
                onClick={initiateOAuth} 
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Github className="mr-2 h-4 w-4" />
                    Connect GitHub Account
                  </>
                )}
              </Button>
            ) : (
              <Alert className="border-green-500">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertTitle>Authenticated!</AlertTitle>
                <AlertDescription>
                  You have successfully authenticated with GitHub.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Step 2: Display Token */}
          {accessToken && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 2: Access Token</h3>
              <div className="space-y-2">
                <Label>Your GitHub Access Token:</Label>
                <div className="flex gap-2">
                  <Input 
                    value={accessToken} 
                    readOnly 
                    className="font-mono text-sm"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={copyToken}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Add this to your .env.local as: REGISTRY_AUTH_TOKEN={accessToken}
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Test Publishing */}
          {accessToken && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 3: Test Registry Publishing</h3>
              
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="name">Server Name</Label>
                  <Input
                    id="name"
                    value={publishData.name}
                    onChange={(e) => setPublishData({ ...publishData, name: e.target.value })}
                    placeholder="io.github.username/repo"
                  />
                </div>
                
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={publishData.description}
                    onChange={(e) => setPublishData({ ...publishData, description: e.target.value })}
                    placeholder="Server description"
                  />
                </div>
                
                <div>
                  <Label htmlFor="version">Version</Label>
                  <Input
                    id="version"
                    value={publishData.version}
                    onChange={(e) => setPublishData({ ...publishData, version: e.target.value })}
                    placeholder="1.0.0"
                  />
                </div>
                
                <div>
                  <Label htmlFor="repoUrl">Repository URL</Label>
                  <Input
                    id="repoUrl"
                    value={publishData.repoUrl}
                    onChange={(e) => setPublishData({ ...publishData, repoUrl: e.target.value })}
                    placeholder="https://github.com/username/repo"
                  />
                </div>
              </div>

              <Button 
                onClick={testPublish}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Test Publish to Registry'
                )}
              </Button>

              {testResult && (
                <Alert className={testResult.success ? 'border-green-500' : 'border-red-500'}>
                  {testResult.success ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                  <AlertTitle>{testResult.success ? 'Success!' : 'Failed'}</AlertTitle>
                  <AlertDescription className="whitespace-pre-wrap">
                    {testResult.message}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}