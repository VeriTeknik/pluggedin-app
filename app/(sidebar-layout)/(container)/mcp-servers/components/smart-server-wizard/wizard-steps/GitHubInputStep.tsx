'use client';

import { AlertCircle,Code, GitBranch, Github, Loader2, Lock, Star } from 'lucide-react';
import { useCallback,useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { WizardData } from '../useWizardState';

interface GitHubInputStepProps {
  data: WizardData;
  onUpdate: (updates: Partial<WizardData>) => void;
  onNext: () => void;
}

// GitHub URL patterns
const GITHUB_PATTERNS = [
  /^https:\/\/github\.com\/([^\/]+)\/([^\/\?]+)(?:\.git)?(?:\/.*)?$/,
  /^git@github\.com:([^\/]+)\/([^\/\?]+?)(?:\.git)?$/,
  /^([^\/]+)\/([^\/]+)$/,  // Simple owner/repo format
];

export function GitHubInputStep({ data, onUpdate, onNext }: GitHubInputStepProps) {
  const [url, setUrl] = useState(data.githubUrl || '');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseGitHubUrl = (input: string): { owner: string; repo: string } | null => {
    const trimmed = input.trim();
    
    for (const pattern of GITHUB_PATTERNS) {
      const match = trimmed.match(pattern);
      if (match) {
        return {
          owner: match[1],
          repo: match[2].replace(/\.git$/, ''),
        };
      }
    }
    
    return null;
  };

  const validateRepository = useCallback(async () => {
    setError(null);
    const parsed = parseGitHubUrl(url);
    
    if (!parsed) {
      setError('Please enter a valid GitHub repository URL');
      return;
    }

    setIsValidating(true);
    
    try {
      // Check repository accessibility
      const response = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('Repository not found. Please check the URL and try again.');
        } else if (response.status === 403) {
          setError('GitHub API rate limit exceeded. Please try again later.');
        } else {
          setError('Failed to access repository. It might be private or the URL is incorrect.');
        }
        setIsValidating(false);
        return;
      }

      const repoData = await response.json();
      
      // Update wizard data
      onUpdate({
        githubUrl: url,
        owner: parsed.owner,
        repo: parsed.repo,
        repoInfo: {
          name: repoData.name,
          description: repoData.description,
          private: repoData.private,
          defaultBranch: repoData.default_branch,
          language: repoData.language,
          stars: repoData.stargazers_count,
        },
      });

      // Move to next step
      onNext();
    } catch (error) {
      console.error('Repository validation error:', error);
      setError('Failed to validate repository. Please check your connection and try again.');
    } finally {
      setIsValidating(false);
    }
  }, [url, onUpdate, onNext]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    validateRepository();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Add a GitHub Repository</h2>
        <p className="text-muted-foreground">
          Enter the URL of the GitHub repository containing your MCP server.
          We'll analyze it to help you configure everything correctly.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="github-url">Repository URL</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Github className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="github-url"
                type="text"
                placeholder="https://github.com/owner/repository"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pl-10"
                disabled={isValidating}
              />
            </div>
            <Button type="submit" disabled={!url.trim() || isValidating}>
              {isValidating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Validating
                </>
              ) : (
                'Validate'
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Supports formats: https://github.com/owner/repo, git@github.com:owner/repo, or owner/repo
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </form>

      {/* Repository preview (if we have cached data) */}
      {data.repoInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              {data.owner}/{data.repo}
            </CardTitle>
            {data.repoInfo.description && (
              <CardDescription>{data.repoInfo.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                {data.repoInfo.private ? (
                  <>
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <span>Private repository</span>
                  </>
                ) : (
                  <>
                    <Star className="h-4 w-4 text-muted-foreground" />
                    <span>{data.repoInfo.stars} stars</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <span>{data.repoInfo.defaultBranch}</span>
              </div>
              {data.repoInfo.language && (
                <div className="flex items-center gap-2">
                  <Code className="h-4 w-4 text-muted-foreground" />
                  <span>{data.repoInfo.language}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Note:</strong> Private repositories can be added, but they will only be 
          accessible to users who have access to the repository on GitHub.
        </AlertDescription>
      </Alert>
    </div>
  );
}