'use client';

import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, Check, Clock, ExternalLink, GitBranch, Loader2, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { UseFormReturn } from 'react-hook-form';

import { type GitHubRepoData } from '@/app/actions/registry-intelligence';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SmartRepositoryInputProps {
  form: UseFormReturn<any>;
  isDetecting: boolean;
  repoData?: GitHubRepoData;
  error?: string;
}

export function SmartRepositoryInput({ 
  form, 
  isDetecting, 
  repoData, 
  error 
}: SmartRepositoryInputProps) {
  const [isValidUrl, setIsValidUrl] = useState(false);
  const repositoryUrl = form.watch('repositoryUrl');

  useEffect(() => {
    // Validate GitHub URL format
    const githubUrlPattern = /^https?:\/\/github\.com\/[^\/]+\/[^\/]+$/;
    setIsValidUrl(githubUrlPattern.test(repositoryUrl));
  }, [repositoryUrl]);

  const getStatusIcon = () => {
    if (isDetecting) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    if (error) return <AlertCircle className="h-4 w-4 text-destructive" />;
    if (repoData) return <Check className="h-4 w-4 text-green-500" />;
    if (isValidUrl) return <GitBranch className="h-4 w-4 text-primary" />;
    return <GitBranch className="h-4 w-4 text-muted-foreground" />;
  };

  const getStatusText = () => {
    if (isDetecting) return 'Fetching repository information...';
    if (error) return error;
    if (repoData) return 'Repository verified';
    if (isValidUrl) return 'Valid GitHub URL format';
    return 'Enter a GitHub repository URL';
  };

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="repositoryUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-2">
              GitHub Repository URL
              {getStatusIcon()}
            </FormLabel>
            <FormControl>
              <div className="relative">
                <Input
                  {...field}
                  placeholder="https://github.com/owner/repository"
                  className={cn(
                    "pr-10",
                    error && "border-destructive",
                    repoData && "border-green-500"
                  )}
                />
                {repoData && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1 h-7 w-7 p-0"
                    onClick={() => window.open(repositoryUrl, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </FormControl>
            <FormMessage />
            <p className="text-sm text-muted-foreground">{getStatusText()}</p>
          </FormItem>
        )}
      />

      {repoData && (
        <Card className="border-muted">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{repoData.fullName}</h3>
                  {repoData.description && (
                    <p className="text-sm text-muted-foreground mt-1">{repoData.description}</p>
                  )}
                </div>
                {repoData.isPrivate && (
                  <Badge variant="secondary">Private</Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {repoData.language && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      repoData.language === 'TypeScript' && "bg-blue-600",
                      repoData.language === 'JavaScript' && "bg-yellow-500",
                      repoData.language === 'Python' && "bg-blue-500",
                      repoData.language === 'Go' && "bg-cyan-500",
                      repoData.language === 'Rust' && "bg-orange-600",
                      !['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust'].includes(repoData.language) && "bg-gray-500"
                    )} />
                    {repoData.language}
                  </Badge>
                )}
                
                <Badge variant="outline" className="flex items-center gap-1">
                  <Star className="h-3 w-3" />
                  {repoData.stars.toLocaleString()}
                </Badge>

                {repoData.license && (
                  <Badge variant="outline">{repoData.license}</Badge>
                )}

                <Badge variant="outline" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(repoData.lastUpdate), { addSuffix: true })}
                </Badge>
              </div>

              {repoData.topics.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Topics</p>
                  <div className="flex flex-wrap gap-1">
                    {repoData.topics.map(topic => (
                      <Badge key={topic} variant="secondary" className="text-xs">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {repoData.homepage && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Homepage:</span>
                  <a 
                    href={repoData.homepage} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    {repoData.homepage}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}