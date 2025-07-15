'use client';

import { AlertCircle, CheckCircle, Code, GitBranch, Github, Loader2, Lock, Star } from 'lucide-react';
import { useCallback,useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
  const { t } = useTranslation('registry');
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
      setError(t('github.inputStep.errors.invalidUrl'));
      return;
    }

    setIsValidating(true);
    
    try {
      // Check repository accessibility
      const response = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setError(t('github.inputStep.errors.notFound'));
        } else if (response.status === 403) {
          setError(t('github.inputStep.errors.rateLimited'));
        } else {
          setError(t('github.inputStep.errors.accessDenied'));
        }
        setIsValidating(false);
        return;
      }

      const repoData = await response.json();
      
      // Check if this repository is already in the registry
      try {
        // Search for servers with this repository
        const searchQuery = `${parsed.owner}/${parsed.repo}`;
        const registryResponse = await fetch(
          `https://registry.plugged.in/v0/servers?search=${encodeURIComponent(searchQuery)}&limit=10`
        );
        
        let registryCheck: { exists: boolean; servers?: any[] } = { exists: false };
        
        if (registryResponse.ok) {
          const registryData = await registryResponse.json();
          const servers = registryData.servers || [];
          
          // Filter for exact matches
          const exactMatches = servers.filter((server: any) => {
            // Check if the server name/id matches the GitHub pattern
            const githubPattern = `io.github.${parsed.owner}/${parsed.repo}`;
            if (server.id === githubPattern || server.name === githubPattern) return true;
            
            // Also check repository URL
            if (server.repository?.url) {
              const repoUrl = server.repository.url.toLowerCase();
              // Parse URL to check hostname properly
              try {
                const url = new URL(server.repository.url);
                const hostname = url.hostname.toLowerCase();
                const pathname = url.pathname.toLowerCase();
                // Check for exact github.com domain (not subdomains)
                if ((hostname === 'github.com' || hostname === 'www.github.com') && 
                    pathname === `/${parsed.owner}/${parsed.repo}`.toLowerCase()) {
                  return true;
                }
              } catch (e) {
                // Invalid URL, skip
              }
              return false;
            }
            
            return false;
          });
          
          if (exactMatches.length > 0) {
            registryCheck = {
              exists: true,
              servers: exactMatches.map((server: any) => ({
                id: server.id,
                name: server.name,
                isClaimed: server.source === 'github',
                source: server.source || 'github',
                version: server.version_detail?.version || server.packages?.[0]?.version
              }))
            };
          }
        }
        
        // Update wizard data with registry check
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
          registryCheck
        });
      } catch (registryError) {
        console.error('Registry check failed:', registryError);
        // Still update wizard data even if registry check fails
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
          registryCheck: { exists: false }
        });
      }

      // Move to next step
      onNext();
    } catch (error) {
      console.error('Repository validation error:', error);
      setError('Failed to validate repository. Please check your connection and try again.');
    } finally {
      setIsValidating(false);
    }
  }, [url, onUpdate, onNext, t]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    validateRepository();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">{t('github.inputStep.title')}</h2>
        <p className="text-muted-foreground">
          {t('github.inputStep.description')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="github-url">{t('github.inputStep.label')}</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Github className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="github-url"
                type="text"
                placeholder={t('github.inputStep.placeholder')}
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
                  {t('github.inputStep.validating')}
                </>
              ) : (
                t('github.inputStep.validate')
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('github.inputStep.supportedFormats')}
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
                    <span>{t('github.inputStep.repository.private')}</span>
                  </>
                ) : (
                  <>
                    <Star className="h-4 w-4 text-muted-foreground" />
                    <span>{t('github.inputStep.repository.stars', { count: data.repoInfo.stars })}</span>
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

      {/* Registry check results */}
      {data.registryCheck?.exists && (
        <Alert variant="default" className="border-orange-500 bg-orange-50 dark:bg-orange-950/20">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="space-y-2">
            <p className="font-semibold text-orange-800 dark:text-orange-300">
              {t('github.inputStep.repository.alreadyInRegistry')}
            </p>
            {data.registryCheck.servers?.map((server) => (
              <div key={server.id} className="mt-2 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{server.name}</span>
                  {server.isClaimed ? (
                    <Badge variant="default" className="text-xs">
                      <CheckCircle className="mr-1 h-3 w-3" />
                      {t('github.inputStep.repository.claimed')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      {t('github.inputStep.repository.community')}
                    </Badge>
                  )}
                  {server.version && (
                    <Badge variant="outline" className="text-xs">
                      {t('github.inputStep.repository.version', { version: server.version })}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Registry ID: {server.id}
                </p>
              </div>
            ))}
            <div className="mt-3 text-sm text-muted-foreground">
              {data.registryCheck.servers?.some(s => s.isClaimed) ? (
                <>
                  <p>This is a claimed server. You can:</p>
                  <ul className="list-disc list-inside ml-2 mt-1">
                    <li>Update the server if you&apos;re the owner</li>
                    <li>Add it as a community server (if not the owner)</li>
                  </ul>
                </>
              ) : (
                <p>
                  This is a community server. You can claim it if you&apos;re the repository owner,
                  or update the community entry.
                </p>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {t('github.inputStep.privateRepoNote')}
        </AlertDescription>
      </Alert>
    </div>
  );
}