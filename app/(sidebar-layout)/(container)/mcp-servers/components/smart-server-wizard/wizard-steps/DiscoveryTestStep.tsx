'use client';

import { useState, useEffect } from 'react';
import { WizardData } from '../useWizardState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StreamingCliToast } from '@/components/ui/streaming-cli-toast';
import { 
  AlertCircle, 
  CheckCircle2, 
  Terminal, 
  Wrench,
  FileText,
  MessageSquare,
  Loader2,
  PlayCircle,
  RefreshCw,
  Code
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createMcpServer } from '@/app/actions/mcp-servers';
import { fetchRegistryServer } from '@/app/actions/registry-servers';
import { useProfiles } from '@/hooks/use-profiles';

interface DiscoveryTestStepProps {
  data: WizardData;
  onUpdate: (updates: Partial<WizardData>) => void;
}

interface DiscoveryResult {
  success: boolean;
  output: string;
  tools?: Array<{ name: string; description?: string }>;
  resources?: Array<{ uri: string; name: string }>;
  prompts?: Array<{ name: string; description?: string }>;
  error?: string;
}

export function DiscoveryTestStep({ data, onUpdate }: DiscoveryTestStepProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [showStreamingToast, setShowStreamingToast] = useState(false);
  const [tempServerUuid, setTempServerUuid] = useState<string | null>(null);
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResult | null>(
    data.discoveryResult || null
  );
  const { toast } = useToast();
  const { currentProfile } = useProfiles();

  // Update wizard data when discovery result changes
  useEffect(() => {
    if (discoveryResult) {
      onUpdate({ discoveryResult });
    }
  }, [discoveryResult, onUpdate]);

  const prepareServerConfig = async () => {
    const owner = data.owner || '';
    const repo = data.repo || '';
    const serverName = repo || 'test-server';
    
    // First, try to get the actual command from registry
    let command = 'npx';
    let args = ['-y'];
    
    try {
      // Check if this server is in the registry
      const registryId = `io.github.${owner}/${repo}`;
      const result = await fetchRegistryServer(registryId);
      
      if (result.success && result.data) {
        const server = result.data;
        const primaryPackage = server.packages?.[0];
        
        if (primaryPackage) {
          // Use the exact command from registry
          switch (primaryPackage.registry_name) {
            case 'npm':
              command = primaryPackage.runtime_hint || 'npx';
              args = [primaryPackage.name];
              if (primaryPackage.runtime_arguments) {
                args.push(...primaryPackage.runtime_arguments);
              }
              break;
            case 'docker':
              command = 'docker';
              args = ['run'];
              if (primaryPackage.package_arguments) {
                args.push(...primaryPackage.package_arguments.map((arg: any) => arg.value || arg.default || ''));
              }
              args.push(primaryPackage.name);
              break;
            case 'pypi':
              command = primaryPackage.runtime_hint || 'uvx';
              args = [primaryPackage.name];
              break;
            default:
              // Fallback to npm pattern
              command = 'npx';
              args = ['-y', `@${owner.toLowerCase()}/${repo.toLowerCase()}`];
          }
        }
      } else {
        // Not in registry, use default npm pattern with lowercase
        args.push(`@${owner.toLowerCase()}/${repo.toLowerCase()}`);
      }
    } catch (error) {
      console.log('Could not fetch from registry, using default pattern');
      // Fallback to npm pattern with lowercase
      args.push(`@${owner.toLowerCase()}/${repo.toLowerCase()}`);
    }
    
    // Get configured environment variables
    const env = data.configuredEnvVars || {};
    
    return {
      name: `${serverName}-test-${Date.now()}`,
      description: 'Temporary server for discovery test',
      command,
      args,
      env: Object.keys(env).length > 0 ? env : undefined,
      type: 'STDIO' as const,
    };
  };

  const runDiscoveryTest = async () => {
    if (!currentProfile?.uuid) {
      toast({
        title: 'Profile not found',
        description: 'Please select a profile first',
        variant: 'destructive',
      });
      return;
    }

    setIsRunning(true);
    setDiscoveryResult(null);
    
    try {
      // Create a temporary server for testing
      const serverConfig = await prepareServerConfig();
      
      const result = await createMcpServer({
        ...serverConfig,
        profileUuid: currentProfile.uuid,
        status: 'ACTIVE',
      });

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to create temporary server');
      }

      // Store the server UUID for discovery
      setTempServerUuid(result.data.uuid);
      
      // Update wizard with server config
      onUpdate({
        serverConfig: {
          command: serverConfig.command,
          args: serverConfig.args,
          type: 'STDIO',
        }
      });
      
      // Show the streaming toast for discovery
      setShowStreamingToast(true);
      
    } catch (error) {
      console.error('Error running discovery test:', error);
      setIsRunning(false);
      setDiscoveryResult({
        success: false,
        output: error instanceof Error ? error.message : 'Unknown error',
        error: 'Failed to start discovery test',
      });
      
      toast({
        title: 'Discovery test failed',
        description: error instanceof Error ? error.message : 'Failed to run discovery test',
        variant: 'destructive',
      });
    }
  };

  const handleDiscoveryComplete = async (success: boolean, data?: any) => {
    setIsRunning(false);
    setShowStreamingToast(false);
    
    if (success) {
      // Extract tools, resources, and prompts from the discovery data
      const result: DiscoveryResult = {
        success: true,
        output: 'Discovery completed successfully',
        tools: data?.tools || [],
        resources: data?.resources || [],
        prompts: data?.prompts || [],
      };
      
      setDiscoveryResult(result);
      
      toast({
        title: 'Discovery successful',
        description: `Found ${result.tools?.length || 0} tools, ${result.resources?.length || 0} resources, and ${result.prompts?.length || 0} prompts`,
      });
    } else {
      setDiscoveryResult({
        success: false,
        output: data?.error || 'Discovery failed',
        error: 'Failed to discover server capabilities',
      });
      
      toast({
        title: 'Discovery failed',
        description: data?.error || 'Failed to discover server capabilities',
        variant: 'destructive',
      });
    }
    
    // Clean up temporary server
    if (tempServerUuid) {
      try {
        const { deleteMcpServerByUuid } = await import('@/app/actions/mcp-servers');
        await deleteMcpServerByUuid(tempServerUuid);
      } catch (error) {
        console.error('Error deleting temporary server:', error);
      }
      setTempServerUuid(null);
    }
  };

  const getCapabilityIcon = (type: 'tools' | 'resources' | 'prompts') => {
    switch (type) {
      case 'tools':
        return <Wrench className="h-4 w-4" />;
      case 'resources':
        return <FileText className="h-4 w-4" />;
      case 'prompts':
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getCapabilityCount = () => {
    if (!discoveryResult || !discoveryResult.success) return { tools: 0, resources: 0, prompts: 0 };
    return {
      tools: discoveryResult.tools?.length || 0,
      resources: discoveryResult.resources?.length || 0,
      prompts: discoveryResult.prompts?.length || 0,
    };
  };

  const counts = getCapabilityCount();
  const totalCapabilities = counts.tools + counts.resources + counts.prompts;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Test Server Discovery</h2>
        <p className="text-muted-foreground">
          Run a discovery test to verify the server works correctly and see what capabilities it provides.
        </p>
      </div>

      {/* Repository info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Test Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Repository:</span>
              <span className="font-mono">{data.owner}/{data.repo}</span>
            </div>
            {data.serverConfig && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Command:</span>
                  <span className="font-mono">{data.serverConfig.command}</span>
                </div>
                {data.serverConfig.args && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Arguments:</span>
                    <span className="font-mono">{data.serverConfig.args.join(' ')}</span>
                  </div>
                )}
              </>
            )}
            {data.configuredEnvVars && Object.keys(data.configuredEnvVars).length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Environment Variables:</span>
                <span>{Object.keys(data.configuredEnvVars).length} configured</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Test button */}
      {!discoveryResult && (
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={runDiscoveryTest}
            disabled={isRunning}
            className="flex items-center gap-2"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running Discovery Test...
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4" />
                Run Discovery Test
              </>
            )}
          </Button>
        </div>
      )}

      {/* Discovery results */}
      {discoveryResult && (
        <div className="space-y-4">
          {/* Status alert */}
          <Alert className={discoveryResult.success ? 'border-green-600' : 'border-destructive'}>
            {discoveryResult.success ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertDescription className="flex items-center justify-between">
              <div>
                {discoveryResult.success ? (
                  <>
                    <strong>Discovery successful!</strong>
                    <p className="text-sm mt-1">
                      Found {totalCapabilities} capabilities: {counts.tools} tools, {counts.resources} resources, {counts.prompts} prompts
                    </p>
                  </>
                ) : (
                  <>
                    <strong>Discovery failed</strong>
                    {discoveryResult.error && (
                      <p className="text-sm mt-1">{discoveryResult.error}</p>
                    )}
                  </>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={runDiscoveryTest}
                disabled={isRunning}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </AlertDescription>
          </Alert>

          {/* Capabilities tabs */}
          {discoveryResult.success && totalCapabilities > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Discovered Capabilities</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="tools" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="tools" className="flex items-center gap-2">
                      {getCapabilityIcon('tools')}
                      Tools ({counts.tools})
                    </TabsTrigger>
                    <TabsTrigger value="resources" className="flex items-center gap-2">
                      {getCapabilityIcon('resources')}
                      Resources ({counts.resources})
                    </TabsTrigger>
                    <TabsTrigger value="prompts" className="flex items-center gap-2">
                      {getCapabilityIcon('prompts')}
                      Prompts ({counts.prompts})
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="tools">
                    <ScrollArea className="h-[200px] w-full">
                      {discoveryResult.tools && discoveryResult.tools.length > 0 ? (
                        <div className="space-y-2">
                          {discoveryResult.tools.map((tool, index) => (
                            <div key={index} className="p-2 border rounded-md">
                              <div className="flex items-start gap-2">
                                <Code className="h-4 w-4 text-muted-foreground mt-0.5" />
                                <div className="flex-1">
                                  <p className="font-mono text-sm">{tool.name}</p>
                                  {tool.description && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {tool.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No tools discovered
                        </p>
                      )}
                    </ScrollArea>
                  </TabsContent>
                  
                  <TabsContent value="resources">
                    <ScrollArea className="h-[200px] w-full">
                      {discoveryResult.resources && discoveryResult.resources.length > 0 ? (
                        <div className="space-y-2">
                          {discoveryResult.resources.map((resource, index) => (
                            <div key={index} className="p-2 border rounded-md">
                              <div className="flex items-start gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                                <div className="flex-1">
                                  <p className="font-mono text-sm">{resource.uri}</p>
                                  {resource.name && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {resource.name}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No resources discovered
                        </p>
                      )}
                    </ScrollArea>
                  </TabsContent>
                  
                  <TabsContent value="prompts">
                    <ScrollArea className="h-[200px] w-full">
                      {discoveryResult.prompts && discoveryResult.prompts.length > 0 ? (
                        <div className="space-y-2">
                          {discoveryResult.prompts.map((prompt, index) => (
                            <div key={index} className="p-2 border rounded-md">
                              <div className="flex items-start gap-2">
                                <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
                                <div className="flex-1">
                                  <p className="font-mono text-sm">{prompt.name}</p>
                                  {prompt.description && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {prompt.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No prompts discovered
                        </p>
                      )}
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Streaming CLI Toast for discovery */}
      {tempServerUuid && currentProfile?.uuid && (
        <StreamingCliToast
          isOpen={showStreamingToast}
          onClose={() => setShowStreamingToast(false)}
          title={`Testing ${data.repo || 'server'}`}
          serverUuid={tempServerUuid}
          profileUuid={currentProfile.uuid}
          onComplete={handleDiscoveryComplete}
        />
      )}
    </div>
  );
}