'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Copy, Github, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface EnvVariable {
  name: string;
  description?: string;
}

export default function TestRegistryAuthPage() {
  // Prevent caching of this page
  if (typeof window !== 'undefined') {
    // Add no-cache meta tags dynamically
    const metaNoCache = document.createElement('meta');
    metaNoCache.setAttribute('http-equiv', 'Cache-Control');
    metaNoCache.setAttribute('content', 'no-cache, no-store, must-revalidate');
    if (!document.head.querySelector('meta[http-equiv="Cache-Control"]')) {
      document.head.appendChild(metaNoCache);
    }
  }
  const [isLoading, setIsLoading] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [publishData, setPublishData] = useState({
    name: 'io.github.yourusername/test-server',
    description: 'Test server for registry authentication',
    version: '1.0.0',
    repoUrl: 'https://github.com/yourusername/test-server'
  });
  const [envVariables, setEnvVariables] = useState<EnvVariable[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // GitHub OAuth configuration
  const GITHUB_CLIENT_ID = 'Ov23liGQCDAID0kY58HE';
  
  // Use subdirectory pattern that GitHub OAuth supports
  const getRedirectUri = () => {
    if (typeof window !== 'undefined') {
      // Use subdirectory of the main callback URL
      return `${window.location.origin}/api/auth/callback/registry`;
    }
    // Fallback for SSR
    return 'https://staging.plugged.in/api/auth/callback/registry';
  };
  
  const REDIRECT_URI = getRedirectUri();
  const GITHUB_OAUTH_URL = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=read:user,read:org&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

  // Check for OAuth callback results on page load
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get('access_token');
    const error = urlParams.get('error');
    
    if (accessToken) {
      setAccessToken(accessToken);
      toast.success('Successfully authenticated with GitHub!');
      // Clean up URL
      window.history.replaceState({}, document.title, '/test-registry-auth');
    } else if (error) {
      toast.error(`Authentication failed: ${error}`);
      // Clean up URL
      window.history.replaceState({}, document.title, '/test-registry-auth');
    }
  }, []);

  const initiateOAuth = () => {
    console.log('REDIRECT_URI:', REDIRECT_URI);
    console.log('GITHUB_OAUTH_URL:', GITHUB_OAUTH_URL);
    window.location.href = GITHUB_OAUTH_URL;
  };

  const copyToken = () => {
    navigator.clipboard.writeText(accessToken);
    toast.success('Token copied to clipboard!');
  };

  const analyzeRepository = async () => {
    if (!publishData.repoUrl) {
      toast.error('Please enter a repository URL');
      return;
    }

    setIsAnalyzing(true);
    try {
      // Extract owner and repo from URL
      const match = publishData.repoUrl.match(/github\.com\/([^\/]+)\/([^\/\?]+)/);
      if (!match) {
        toast.error('Invalid GitHub URL');
        return;
      }

      const [, owner, repo] = match;
      
      // Try to fetch claude_desktop_config.json from the repository
      const configUrls = [
        `https://raw.githubusercontent.com/${owner}/${repo}/main/claude_desktop_config.json`,
        `https://raw.githubusercontent.com/${owner}/${repo}/master/claude_desktop_config.json`,
        `https://raw.githubusercontent.com/${owner}/${repo}/main/mcp.json`,
        `https://raw.githubusercontent.com/${owner}/${repo}/master/mcp.json`,
      ];

      let mcpConfig = null;
      for (const url of configUrls) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            mcpConfig = await response.json();
            break;
          }
        } catch (e) {
          // Continue to next URL
        }
      }

      if (mcpConfig && mcpConfig.mcpServers) {
        // Extract environment variables from the first server
        const firstServer = Object.values(mcpConfig.mcpServers)[0] as any;
        if (firstServer && firstServer.env) {
          const envVars: EnvVariable[] = [];
          for (const [name, value] of Object.entries(firstServer.env)) {
            envVars.push({
              name,
              description: `Environment variable for ${name}`
            });
          }
          setEnvVariables(envVars);
          toast.success(`Found ${envVars.length} environment variables`);
        }
      } else {
        // Try to fetch README and detect env vars
        const readmeUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`;
        const readmeResponse = await fetch(readmeUrl);
        
        if (readmeResponse.ok) {
          const readmeText = await readmeResponse.text();
          
          // Look for environment variable patterns
          const envPatterns = [
            /`([A-Z][A-Z0-9_]+)`/g,  // Backtick wrapped
            /\$\{?([A-Z][A-Z0-9_]+)\}?/g,  // Shell variable syntax
            /process\.env\.([A-Z][A-Z0-9_]+)/g,  // Node.js syntax
          ];

          const foundVars = new Set<string>();
          for (const pattern of envPatterns) {
            let match;
            while ((match = pattern.exec(readmeText)) !== null) {
              const varName = match[1];
              if (varName.length > 2 && varName !== 'NODE' && varName !== 'PATH') {
                foundVars.add(varName);
              }
            }
          }

          const envVars: EnvVariable[] = Array.from(foundVars).map(name => ({
            name,
            description: `Environment variable detected from README`
          }));
          
          setEnvVariables(envVars);
          toast.success(`Detected ${envVars.length} environment variables from README`);
        } else {
          toast.error('Could not find MCP configuration or README');
        }
      }
    } catch (error) {
      console.error('Failed to analyze repository:', error);
      toast.error('Failed to analyze repository');
    } finally {
      setIsAnalyzing(false);
    }
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
          version: publishData.version,
          environment_variables: envVariables.map(env => ({
            name: env.name,
            description: env.description || `Environment variable ${env.name}`
          }))
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
                  <div className="flex gap-2">
                    <Input
                      id="repoUrl"
                      value={publishData.repoUrl}
                      onChange={(e) => setPublishData({ ...publishData, repoUrl: e.target.value })}
                      placeholder="https://github.com/username/repo"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={analyzeRepository}
                      disabled={isAnalyzing}
                      title="Analyze repository for environment variables"
                    >
                      {isAnalyzing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {envVariables.length > 0 && (
                <div className="mt-4">
                  <Label>Detected Environment Variables</Label>
                  <div className="mt-2 space-y-2">
                    {envVariables.map((env, index) => (
                      <div key={index} className="p-2 bg-muted rounded-md">
                        <div className="font-mono text-sm">{env.name}</div>
                        {env.description && (
                          <div className="text-xs text-muted-foreground mt-1">{env.description}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

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