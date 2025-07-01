'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Code, GitBranch, Info, Loader2, Package, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

import { 
  detectEnvironmentVariables,
  detectPackageInfo, 
  type EnvVariable,
  fetchRepositoryData, 
  type GitHubRepoData,
  type PackageInfo
} from '@/app/actions/registry-intelligence';
import { 
  addUnclaimedServer, 
  publishClaimedServer, 
  verifyGitHubOwnership 
} from '@/app/actions/registry-servers';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';

import { AutoDetectionPanel } from './AutoDetectionPanel';
import { EnvironmentVariablesEditor } from './EnvironmentVariablesEditor';
import { PackageConfigSection } from './PackageConfigSection';
import { SmartRepositoryInput } from './SmartRepositoryInput';

interface IntelligentAddServerWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const serverSchema = z.object({
  repositoryUrl: z.string().url('Please enter a valid URL'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  packageRegistry: z.enum(['npm', 'docker', 'pypi']).optional(),
  packageName: z.string().optional(),
  packageVersion: z.string().optional(),
  environmentVariables: z.array(z.object({
    name: z.string(),
    description: z.string(),
    required: z.boolean(),
    defaultValue: z.string().optional()
  })).optional()
});

type ServerFormData = z.infer<typeof serverSchema>;

interface DetectionState {
  isDetecting: boolean;
  repoData?: GitHubRepoData;
  packageInfo?: PackageInfo;
  envVariables?: EnvVariable[];
  errors: Record<string, string>;
  progress: number;
}

export function IntelligentAddServerWizard({ open, onOpenChange }: IntelligentAddServerWizardProps) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [detectionState, setDetectionState] = useState<DetectionState>({
    isDetecting: false,
    errors: {},
    progress: 0
  });

  const form = useForm<ServerFormData>({
    resolver: zodResolver(serverSchema),
    defaultValues: {
      repositoryUrl: '',
      description: '',
      environmentVariables: []
    }
  });

  const repositoryUrl = form.watch('repositoryUrl');

  // Auto-detect repository information when URL changes
  useEffect(() => {
    if (!repositoryUrl || !repositoryUrl.includes('github.com')) {
      setDetectionState(prev => ({ ...prev, repoData: undefined, packageInfo: undefined, envVariables: undefined }));
      return;
    }

    const detectInfo = async () => {
      setDetectionState(prev => ({ ...prev, isDetecting: true, progress: 0, errors: {} }));

      try {
        // Fetch repository data
        setDetectionState(prev => ({ ...prev, progress: 25 }));
        const repoResult = await fetchRepositoryData(repositoryUrl);
        
        if (!repoResult.success) {
          setDetectionState(prev => ({ 
            ...prev, 
            isDetecting: false, 
            errors: { repo: repoResult.error || 'Failed to fetch repository' } 
          }));
          return;
        }

        setDetectionState(prev => ({ ...prev, repoData: repoResult.data, progress: 50 }));

        // Auto-fill description if empty
        if (repoResult.data?.description && !form.getValues('description')) {
          form.setValue('description', repoResult.data.description);
        }

        // Detect package information
        const packageResult = await detectPackageInfo(repositoryUrl);
        setDetectionState(prev => ({ ...prev, progress: 75 }));
        
        if (packageResult.success && packageResult.data) {
          setDetectionState(prev => ({ ...prev, packageInfo: packageResult.data }));
          
          // Auto-fill package fields
          if (packageResult.data.type) {
            form.setValue('packageRegistry', packageResult.data.type);
          }
          if (packageResult.data.name) {
            form.setValue('packageName', packageResult.data.name);
          }
          if (packageResult.data.version) {
            form.setValue('packageVersion', packageResult.data.version);
          }
        }

        // Detect environment variables
        const envResult = await detectEnvironmentVariables(repositoryUrl);
        setDetectionState(prev => ({ ...prev, progress: 100 }));
        
        if (envResult.success && envResult.data) {
          setDetectionState(prev => ({ ...prev, envVariables: envResult.data }));
          form.setValue('environmentVariables', envResult.data);
        }

        // Check ownership if user is authenticated
        if (session?.user) {
          const ownershipResult = await verifyGitHubOwnership(session.user.id, repositoryUrl);
          setIsOwner(ownershipResult.success && ownershipResult.data?.isOwner === true);
        }

        setDetectionState(prev => ({ ...prev, isDetecting: false }));
      } catch (error) {
        console.error('Detection error:', error);
        setDetectionState(prev => ({ 
          ...prev, 
          isDetecting: false, 
          errors: { general: 'Failed to auto-detect repository information' }
        }));
      }
    };

    const timer = setTimeout(detectInfo, 500);
    return () => clearTimeout(timer);
  }, [repositoryUrl, form, session]);

  const onSubmit = async (data: ServerFormData) => {
    setIsSubmitting(true);

    try {
      const serverData = {
        repositoryUrl: data.repositoryUrl,
        description: data.description,
        packageRegistry: data.packageRegistry,
        packageName: data.packageName,
        packageVersion: data.packageVersion,
        environmentVariables: data.environmentVariables || []
      };

      // If owner, publish directly to registry
      if (isOwner) {
        const result = await publishClaimedServer({
          ...serverData,
          githubOwner: detectionState.repoData?.owner || '',
          githubRepo: detectionState.repoData?.name || ''
        });

        if (result.success) {
          toast.success(t('registry.addServer.success.claimed'));
          onOpenChange(false);
          form.reset();
        } else {
          toast.error(result.error || t('registry.errors.publishFailed'));
        }
      } else {
        // Add as unclaimed server
        const result = await addUnclaimedServer(serverData);

        if (result.success) {
          toast.success(t('registry.addServer.success.unclaimed'));
          onOpenChange(false);
          form.reset();
        } else {
          toast.error(result.error || 'Failed to add server');
        }
      }
    } catch (error) {
      console.error('Submit error:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getIntelligentSuggestions = useCallback(() => {
    const suggestions = [];

    // Package type suggestion
    if (!detectionState.packageInfo?.type && detectionState.repoData) {
      if (detectionState.repoData.language === 'JavaScript' || detectionState.repoData.language === 'TypeScript') {
        suggestions.push({
          type: 'package',
          message: 'This looks like a Node.js project. Consider using NPM as the package registry.',
          action: () => form.setValue('packageRegistry', 'npm')
        });
      } else if (detectionState.repoData.language === 'Python') {
        suggestions.push({
          type: 'package',
          message: 'This looks like a Python project. Consider using PyPI as the package registry.',
          action: () => form.setValue('packageRegistry', 'pypi')
        });
      }
    }

    // Environment variable suggestions
    if (detectionState.envVariables && detectionState.envVariables.length === 0) {
      suggestions.push({
        type: 'env',
        message: 'No environment variables detected. MCP servers often use API keys or configuration.',
        action: null
      });
    }

    return suggestions;
  }, [detectionState, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t('registry.addServer.title')}
          </DialogTitle>
          <DialogDescription>
            {isOwner === true 
              ? t('registry.addServer.description.claimed')
              : isOwner === false 
              ? t('registry.addServer.description.unclaimed')
              : t('registry.addServer.description.ownership')}
          </DialogDescription>
        </DialogHeader>

        {detectionState.isDetecting && (
          <Progress value={detectionState.progress} className="mb-4" />
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-hidden flex flex-col">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic" className="flex items-center gap-1">
                  <GitBranch className="h-4 w-4" />
                  Basic Info
                </TabsTrigger>
                <TabsTrigger value="package" className="flex items-center gap-1">
                  <Package className="h-4 w-4" />
                  Package
                </TabsTrigger>
                <TabsTrigger value="config" className="flex items-center gap-1">
                  <Code className="h-4 w-4" />
                  Configuration
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1 px-1">
                <TabsContent value="basic" className="space-y-4 pb-4">
                  <SmartRepositoryInput
                    form={form}
                    isDetecting={detectionState.isDetecting}
                    repoData={detectionState.repoData}
                    error={detectionState.errors.repo}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('registry.form.description')}</FormLabel>
                        <FormControl>
                          <textarea
                            {...field}
                            placeholder={t('registry.form.description.placeholder')}
                            className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {detectionState.repoData && (
                    <AutoDetectionPanel 
                      repoData={detectionState.repoData}
                      packageInfo={detectionState.packageInfo}
                      isOwner={isOwner}
                    />
                  )}
                </TabsContent>

                <TabsContent value="package" className="space-y-4 pb-4">
                  <PackageConfigSection
                    form={form}
                    packageInfo={detectionState.packageInfo}
                    repoData={detectionState.repoData}
                  />

                  {getIntelligentSuggestions().filter(s => s.type === 'package').map((suggestion, idx) => (
                    <Alert key={idx}>
                      <Info className="h-4 w-4" />
                      <AlertTitle>Suggestion</AlertTitle>
                      <AlertDescription className="flex items-center justify-between">
                        <span>{suggestion.message}</span>
                        {suggestion.action && (
                          <Button size="sm" variant="outline" onClick={suggestion.action}>
                            Apply
                          </Button>
                        )}
                      </AlertDescription>
                    </Alert>
                  ))}
                </TabsContent>

                <TabsContent value="config" className="space-y-4 pb-4">
                  <EnvironmentVariablesEditor
                    form={form}
                    detectedVariables={detectionState.envVariables}
                  />

                  {getIntelligentSuggestions().filter(s => s.type === 'env').map((suggestion, idx) => (
                    <Alert key={idx}>
                      <Info className="h-4 w-4" />
                      <AlertTitle>Note</AlertTitle>
                      <AlertDescription>{suggestion.message}</AlertDescription>
                    </Alert>
                  ))}
                </TabsContent>
              </ScrollArea>
            </Tabs>

            <Separator className="my-4" />

            <div className="flex justify-between items-center">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              
              <div className="flex items-center gap-2">
                {isOwner !== null && (
                  <Badge variant={isOwner ? "default" : "secondary"}>
                    {isOwner ? "Verified Owner" : "Community Contribution"}
                  </Badge>
                )}
                
                <Button type="submit" disabled={isSubmitting || detectionState.isDetecting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('common.installing')}
                    </>
                  ) : (
                    <>
                      {isOwner 
                        ? t('registry.form.submit.claimed')
                        : t('registry.form.submit.unclaimed')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}