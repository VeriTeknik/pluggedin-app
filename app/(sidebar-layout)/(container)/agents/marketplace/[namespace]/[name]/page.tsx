'use client';

import {
  ArrowLeft,
  BadgeCheck,
  Box,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Github,
  Globe,
  Info,
  Lock,
  Rocket,
  Star,
  Tag,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';

import { AgentConfigForm } from '@/components/agents/agent-config-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import type { ConfigValues, TemplateConfigurable } from '@/lib/agent-config';
import {
  getDefaultConfigValues,
  parseConfigurable,
} from '@/lib/agent-config';
import {
  type AgentTemplateDetail,
  DEFAULT_CONTAINER_PORT,
  isValidImageUrl,
  SWR_MARKETPLACE_CONFIG,
  validateAgentName,
} from '@/lib/pap-ui-utils';

interface TemplateVersion {
  version: string;
  created_at: string;
}

interface TemplateResponse {
  template: AgentTemplateDetail;
  versions: TemplateVersion[];
}

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch template');
  return response.json();
};

export default function TemplateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const namespace = params.namespace as string;
  const name = params.name as string;

  const { data, error, isLoading } = useSWR(
    `/api/agents/templates/${namespace}/${name}`,
    fetcher,
    SWR_MARKETPLACE_CONFIG
  ) as {
    data: TemplateResponse | undefined;
    error: any;
    isLoading: boolean;
  };

  const [isDeployDialogOpen, setIsDeployDialogOpen] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [accessLevel, setAccessLevel] = useState('PRIVATE');
  const [isDeploying, setIsDeploying] = useState(false);

  // Parse template's configurable section
  const configurable: TemplateConfigurable | null = data?.template
    ? parseConfigurable(data.template.configurable)
    : null;

  // Configuration form state - initialize with default values from template
  const [configValues, setConfigValues] = useState<ConfigValues>(() => {
    return configurable ? getDefaultConfigValues(configurable) : {};
  });
  const [isConfigValid, setIsConfigValid] = useState(true);

  // Compute validation once to avoid multiple calls per render
  const nameError = validateAgentName(agentName);

  const handleDeploy = async () => {
    if (!data?.template) return;

    try {
      setIsDeploying(true);
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName,
          template_uuid: data.template.uuid,
          access_level: accessLevel,
          config_values: configurable ? configValues : undefined,
        }),
      });

      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 429) {
          throw new Error('Deployment rate limit reached. Please try again later.');
        }
        if (response.status === 409) {
          throw new Error('An agent with this name already exists. Please choose a different name.');
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to deploy agent');
      }

      const result = await response.json();

      toast({
        title: 'Agent Deployed',
        description: `${data.template.display_name} has been deployed as "${agentName}".`,
      });

      // Navigate to the new agent
      router.push(`/agents/${result.agent.uuid}`);
    } catch (error) {
      toast({
        title: 'Deployment Failed',
        description: error instanceof Error ? error.message : 'Failed to deploy agent',
        variant: 'destructive',
      });
    } finally {
      setIsDeploying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-4 w-96 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (error || !data?.template) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <Box className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Template Not Found</h3>
            <p className="text-muted-foreground mb-4">
              The template "{namespace}/{name}" could not be found.
            </p>
            <Button asChild>
              <Link href="/agents/marketplace">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Marketplace
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const template = data.template;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/agents/marketplace">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Marketplace
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row gap-6 mb-8">
        {/* Icon */}
        {isValidImageUrl(template.icon_url) ? (
          <img
            src={template.icon_url}
            alt={template.display_name}
            className="w-24 h-24 rounded-xl object-cover"
          />
        ) : (
          <div className="w-24 h-24 rounded-xl bg-muted flex items-center justify-center">
            <Box className="h-12 w-12 text-muted-foreground" />
          </div>
        )}

        {/* Title & Meta */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-3xl font-bold">{template.display_name}</h1>
            {template.is_verified && (
              <BadgeCheck className="h-6 w-6 text-blue-500" />
            )}
          </div>
          <p className="text-muted-foreground font-mono text-sm mb-3">
            {template.namespace}/{template.name} v{template.version}
          </p>
          <p className="text-lg text-muted-foreground mb-4">
            {template.description}
          </p>
          <div className="flex flex-wrap gap-2">
            {template.is_featured && (
              <Badge variant="default">
                <Star className="mr-1 h-3 w-3" />
                Featured
              </Badge>
            )}
            {template.category && (
              <Badge variant="outline">{template.category}</Badge>
            )}
            {template.tags?.map((tag) => (
              <Badge key={tag} variant="secondary">
                <Tag className="mr-1 h-3 w-3" />
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {/* Deploy Button */}
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            onClick={() => setIsDeployDialogOpen(true)}
            aria-label={`Deploy ${template.display_name}`}
          >
            <Rocket className="mr-2 h-5 w-5" aria-hidden="true" />
            Deploy Agent
          </Button>
          <div className="flex items-center justify-center text-sm text-muted-foreground">
            <Download className="mr-1 h-4 w-4" />
            {template.install_count} installs
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="md:col-span-2 space-y-6">
          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent>
              {template.long_description ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {template.long_description}
                  </pre>
                </div>
              ) : (
                <p className="text-muted-foreground">{template.description}</p>
              )}
            </CardContent>
          </Card>

          {/* Environment Variables */}
          {template.env_schema && (
            <Card>
              <CardHeader>
                <CardTitle>Configuration</CardTitle>
                <CardDescription>
                  Environment variables for this agent
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {template.env_schema.required && template.env_schema.required.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2 text-sm">Required</h4>
                    <div className="space-y-1">
                      {template.env_schema.required.map((env) => (
                        <code
                          key={env}
                          className="block text-xs bg-muted px-2 py-1 rounded"
                        >
                          {env}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
                {template.env_schema.optional && template.env_schema.optional.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2 text-sm">Optional</h4>
                    <div className="space-y-1">
                      {template.env_schema.optional.map((env) => (
                        <code
                          key={env}
                          className="block text-xs bg-muted px-2 py-1 rounded"
                        >
                          {env}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Technical Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Technical Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Image</span>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-[150px]">
                  {template.docker_image.split('/').pop()}
                </code>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Port</span>
                <span>{template.container_port || DEFAULT_CONTAINER_PORT}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Health Check</span>
                <code className="text-xs">{template.health_endpoint || '/health'}</code>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version</span>
                <span>{template.version}</span>
              </div>
            </CardContent>
          </Card>

          {/* Links */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {template.repository_url && (
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <a href={template.repository_url} target="_blank" rel="noopener noreferrer">
                    <Github className="mr-2 h-4 w-4" />
                    Source Code
                    <ExternalLink className="ml-auto h-3 w-3" />
                  </a>
                </Button>
              )}
              {template.documentation_url && (
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <a href={template.documentation_url} target="_blank" rel="noopener noreferrer">
                    <FileText className="mr-2 h-4 w-4" />
                    Documentation
                    <ExternalLink className="ml-auto h-3 w-3" />
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Versions */}
          {data.versions && data.versions.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Version History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.versions.slice(0, 5).map((v) => (
                    <div
                      key={v.version}
                      className="flex justify-between text-sm"
                    >
                      <span className="font-mono">{v.version}</span>
                      <span className="text-muted-foreground">
                        {new Date(v.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Deploy Dialog */}
      <Dialog open={isDeployDialogOpen} onOpenChange={setIsDeployDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {isValidImageUrl(template.icon_url) ? (
                <img
                  src={template.icon_url}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <Box className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <DialogTitle>Deploy {template.display_name}</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  v{template.version} by {template.namespace}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid gap-5 py-4">
            {/* Agent Identity Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Zap className="h-4 w-4" />
                Agent Identity
              </div>
              <div className="grid gap-2">
                <Label htmlFor="agentName">Name</Label>
                <Input
                  id="agentName"
                  placeholder="my-agent"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  maxLength={63}
                  className={nameError ? 'border-destructive' : ''}
                />
                {nameError ? (
                  <p className="text-xs text-destructive">{nameError}</p>
                ) : agentName ? (
                  <div className="text-xs bg-primary/5 border border-primary/20 p-2 rounded-md">
                    <div className="flex items-center gap-2 text-primary">
                      <Globe className="h-3 w-3" />
                      <span className="font-mono">{agentName}.is.plugged.in</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Lowercase letters, numbers, and hyphens only
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Access Control Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Lock className="h-4 w-4" />
                Access Control
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAccessLevel('PRIVATE')}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                    accessLevel === 'PRIVATE'
                      ? 'border-primary bg-primary/5'
                      : 'border-muted hover:border-muted-foreground/30'
                  }`}
                >
                  <Lock className={`h-5 w-5 ${accessLevel === 'PRIVATE' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="text-center">
                    <div className="text-sm font-medium">Private</div>
                    <div className="text-xs text-muted-foreground">API Key Required</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setAccessLevel('PUBLIC')}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                    accessLevel === 'PUBLIC'
                      ? 'border-primary bg-primary/5'
                      : 'border-muted hover:border-muted-foreground/30'
                  }`}
                >
                  <Globe className={`h-5 w-5 ${accessLevel === 'PUBLIC' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="text-center">
                    <div className="text-sm font-medium">Public</div>
                    <div className="text-xs text-muted-foreground">Link Sharing</div>
                  </div>
                </button>
              </div>
              {accessLevel === 'PUBLIC' && (
                <div className="flex items-start gap-2 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                  <Info className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-yellow-700 dark:text-yellow-500">
                    Anyone with the URL can access this agent. You pay for all usage.
                  </p>
                </div>
              )}
            </div>

            {/* Configuration Form - only show if template has configurable section */}
            {configurable && Object.keys(configurable).length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Box className="h-4 w-4" />
                      Model Configuration
                    </div>
                    {/* Legend for icons */}
                    <TooltipProvider>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 cursor-help">
                              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                              <span>Featured</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Recommended models with best price/performance</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 cursor-help">
                              <Eye className="h-3 w-3 text-blue-500" />
                              <span>Vision</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Supports image/vision input</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
                  </div>
                  <AgentConfigForm
                    configurable={configurable}
                    onChange={(values, isValid) => {
                      setConfigValues(values);
                      setIsConfigValid(isValid);
                    }}
                    className="border rounded-lg p-4 bg-muted/30"
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsDeployDialogOpen(false)}
              disabled={isDeploying}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeploy}
              disabled={!agentName || !!nameError || !isConfigValid || isDeploying}
              className="gap-2"
            >
              {isDeploying ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  Deploy Agent
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
