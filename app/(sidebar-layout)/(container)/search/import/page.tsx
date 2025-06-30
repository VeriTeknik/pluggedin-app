'use client';

import { AlertCircle, ArrowLeft, CheckCircle, Github, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { importGitHubRepository } from '@/app/actions/registry';
import { DynamicServerConfigForm, ExtractedConfig } from '@/components/forms/dynamic-server-config-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useProfiles } from '@/hooks/use-profiles';

export default function ImportPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { session } = useAuth();
  const { currentProfile } = useProfiles();
  
  const [githubUrl, setGithubUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [extractedConfig, setExtractedConfig] = useState<ExtractedConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [hasGitHubApp, setHasGitHubApp] = useState<boolean | null>(null);
  const [checkingGitHub, setCheckingGitHub] = useState(true);

  // Check for GitHub App installation
  useEffect(() => {
    const checkGitHubInstallation = async () => {
      try {
        const response = await fetch('/api/github/installations');
        if (response.ok) {
          const data = await response.json();
          setHasGitHubApp(data.hasInstallation);
        } else {
          setHasGitHubApp(false);
        }
      } catch (error) {
        console.error('Failed to check GitHub installation', error);
        setHasGitHubApp(false);
      } finally {
        setCheckingGitHub(false);
      }
    };

    if (session?.user) {
      checkGitHubInstallation();
    } else {
      setCheckingGitHub(false);
    }
  }, [session]);

  // Handle GitHub connection success
  useEffect(() => {
    if (searchParams.get('github_connected') === 'true') {
      toast({
        title: 'Success',
        description: 'GitHub App connected successfully!',
      });
      setHasGitHubApp(true);
    }

    const error = searchParams.get('error');
    if (error) {
      toast({
        title: 'Error',
        description: `GitHub connection failed: ${error.replace(/_/g, ' ')}`,
        variant: 'destructive',
      });
    }
  }, [searchParams, toast]);

  // Check authentication
  if (!session?.user || !currentProfile) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertDescription>
            Please log in to import MCP servers.
            <Button className="ml-4" onClick={() => router.push('/login')}>
              Log In
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const handleAnalyze = async () => {
    if (!githubUrl) return;

    // Check if GitHub App is connected for private repos
    if (!hasGitHubApp) {
      // Parse URL to check if it might be a private repo
      try {
        const url = new URL(githubUrl);
        if (url.hostname === 'github.com') {
          // For now, we'll proceed but warn the user
          toast({
            title: 'Note',
            description: 'Connect GitHub App to access private repositories',
          });
        }
      } catch (e) {
        // Invalid URL, let the backend handle it
      }
    }

    setIsAnalyzing(true);
    setError(null);
    setProgress(0);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      const result = await importGitHubRepository(githubUrl);
      
      clearInterval(progressInterval);
      setProgress(100);

      if (result.success && result.server) {
        setAnalysisResult(result);
        
        // Transform the server data to match ExtractionResult format
        const extractionResult = {
          extracted_config: {
            name: result.server.name,
            description: result.server.description,
            command: result.server.command,
            args: result.server.args || [],
            env: result.server.env || {},
            capabilities: result.server.capabilities || {
              tools: false,
              resources: false,
              prompts: false,
              logging: false
            },
            transport: result.server.transport as 'stdio' | 'sse' | 'streamable-http',
            url: result.server.url,
          },
          confidence_scores: result.extraction?.confidence || { overall: 0.5, completeness: 0.5 },
          warnings: result.extraction?.warnings || []
        };
        
        setAnalysisResult(extractionResult);
        setExtractedConfig(extractionResult.extracted_config);
        
        toast({
          title: 'Success',
          description: 'Repository analyzed successfully!',
        });
      } else {
        setError(result.error || 'Failed to analyze repository');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleConnectGitHub = async () => {
    try {
      const response = await fetch('/api/github/auth/init');
      if (response.ok) {
        const data = await response.json();
        window.location.href = data.installUrl;
      } else {
        toast({
          title: 'Error',
          description: 'Failed to initialize GitHub connection',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to connect to GitHub',
        variant: 'destructive',
      });
    }
  };

  const handleConfigSubmit = async (config: any) => {
    try {
      // Create the MCP server using the server action
      const { createMcpServer } = await import('@/app/actions/mcp-servers');
      
      const result = await createMcpServer({
        profileUuid: currentProfile.uuid,
        name: config.name,
        description: config.description,
        type: config.type,
        command: config.command || '',
        args: config.args || [],
        env: config.env || {},
        url: config.url || '',
        capabilities: config.capabilities || {
          tools: false,
          resources: false,
          prompts: false,
          logging: false
        },
        metadata: {
          source: 'github',
          repository: githubUrl,
          extractedAt: new Date().toISOString()
        }
      });

      if (result.success) {
        toast({
          title: 'Success',
          description: 'MCP server added to your profile!',
        });
        
        // Redirect to MCP servers page
        router.push('/mcp-servers');
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to create MCP server',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create MCP server',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        
        <h1 className="text-3xl font-bold mb-2">Import MCP Server from GitHub</h1>
        <p className="text-muted-foreground">
          Analyze a GitHub repository to automatically extract MCP server configuration
        </p>
      </div>

      {!extractedConfig ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              GitHub Repository
            </CardTitle>
            <CardDescription>
              Enter the URL of a GitHub repository containing an MCP server
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {checkingGitHub ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : !hasGitHubApp && (
              <Alert className="mb-4">
                <Github className="h-4 w-4" />
                <AlertDescription>
                  <div className="flex items-center justify-between">
                    <span>Connect GitHub to access private repositories</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleConnectGitHub}
                      className="ml-4"
                    >
                      <Github className="h-4 w-4 mr-2" />
                      Connect GitHub
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="github-url">Repository URL</Label>
              <Input
                id="github-url"
                type="url"
                placeholder="https://github.com/owner/repository"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                disabled={isAnalyzing}
              />
              <p className="text-sm text-muted-foreground">
                Example: https://github.com/modelcontextprotocol/server-everything
              </p>
            </div>

            {isAnalyzing && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing repository with AI...
                </div>
                <Progress value={progress} />
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{typeof error === 'string' ? error : error?.message || 'An error occurred'}</AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleAnalyze}
              disabled={!githubUrl || isAnalyzing}
              className="w-full"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing Repository...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Analyze Repository
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {analysisResult?.extraction?.warnings?.length > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>AI Extraction Warnings:</strong>
                <ul className="list-disc list-inside mt-2">
                  {analysisResult.extraction.warnings.map((warning: string, index: number) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <DynamicServerConfigForm
            extractionResult={analysisResult}
            onSubmit={handleConfigSubmit}
            isSubmitting={false}
          />
        </div>
      )}
    </div>
  );
}