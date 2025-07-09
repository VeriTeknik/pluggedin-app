'use client';

import {
  AlertCircle,
  CheckCircle2,
  Code,
  FileText,
  Globe,
  Loader2,
  MessageSquare,
  Package,
  PlayCircle,
  RefreshCw,
  Terminal,
  Wrench,
} from 'lucide-react';
import { useEffect,useState } from 'react';

import { detectPackageConfiguration } from '@/app/actions/detect-package';
import { createMcpServer } from '@/app/actions/mcp-servers';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StreamingCliToast } from '@/components/ui/streaming-cli-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { McpServerType } from '@/db/schema';
import { useProfiles } from '@/hooks/use-profiles';
import { useToast } from '@/hooks/use-toast';
import { TransportType } from '@/lib/mcp/package-detector';

import { WizardData } from '../useWizardState';

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

interface TransportOption {
  value: TransportType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const transportOptions: TransportOption[] = [
  {
    value: 'stdio',
    label: 'STDIO',
    icon: Terminal,
    description: 'Local command-line execution',
  },
  {
    value: 'streamable-http',
    label: 'Streamable HTTP',
    icon: Globe,
    description: 'Modern HTTP transport with streaming support',
  },
  {
    value: 'docker',
    label: 'Docker',
    icon: Package,
    description: 'Container-based deployment',
  },
];

export function DiscoveryTestStep({ data, onUpdate }: DiscoveryTestStepProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [showStreamingToast, setShowStreamingToast] = useState(false);
  const [tempServerUuid, setTempServerUuid] = useState<string | null>(null);
  const [selectedTransports, setSelectedTransports] = useState<TransportType[]>(
    data.selectedTransports || ['stdio']
  );
  const [activeTransport, setActiveTransport] =
    useState<TransportType>('stdio');
  const [discoveryResult, setDiscoveryResult] =
    useState<DiscoveryResult | null>(data.discoveryResult || null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedConfigs, setDetectedConfigs] = useState<Record<string, any>>(
    {}
  );
  const { toast } = useToast();
  const { currentProfile } = useProfiles();

  // Update wizard data when discovery result or transports change
  useEffect(() => {
    const updates: Partial<WizardData> = {};
    if (discoveryResult) {
      updates.discoveryResult = discoveryResult;
    }
    if (selectedTransports.length > 0) {
      updates.selectedTransports = selectedTransports;
    }
    if (Object.keys(detectedConfigs).length > 0) {
      updates.transportConfigs = detectedConfigs;
    }
    if (Object.keys(updates).length > 0) {
      onUpdate(updates);
    }
  }, [discoveryResult, selectedTransports, detectedConfigs, onUpdate]);

  // Detect package configurations when component mounts or repo changes
  useEffect(() => {
    if (data.owner && data.repo && selectedTransports.length > 0) {
      detectConfigurations();
    }
  }, [data.owner, data.repo]);

  const detectConfigurations = async () => {
    if (!data.owner || !data.repo) return;

    setIsDetecting(true);
    try {
      const configs = await detectPackageConfiguration(
        data.owner,
        data.repo,
        selectedTransports
      );
      setDetectedConfigs(configs);

      // If we detected a high-confidence STDIO config, automatically run a test
      const stdioConfig = configs['stdio'];
      if (stdioConfig && stdioConfig.confidence >= 0.9) {
        toast({
          title: 'Package detected!',
          description: `Found ${stdioConfig.packageName} with ${Math.round(stdioConfig.confidence * 100)}% confidence`,
        });
      }
    } catch (error) {
      console.error('Error detecting configurations:', error);
      toast({
        title: 'Detection error',
        description: 'Failed to detect package configuration from GitHub',
        variant: 'destructive',
      });
    } finally {
      setIsDetecting(false);
    }
  };

  const handleTransportToggle = (transport: TransportType) => {
    setSelectedTransports((prev) => {
      const newTransports = prev.includes(transport)
        ? prev.filter((t) => t !== transport)
        : [...prev, transport];

      // If we removed the active transport, switch to the first available
      if (
        !newTransports.includes(activeTransport) &&
        newTransports.length > 0
      ) {
        setActiveTransport(newTransports[0]);
      }

      return newTransports;
    });
  };

  const prepareServerConfig = async () => {
    const owner = data.owner || '';
    const repo = data.repo || '';
    const serverName = repo || 'test-server';

    // Get the detected configuration for the active transport
    const config = detectedConfigs[activeTransport];
    if (!config) {
      throw new Error(
        `No configuration detected for ${activeTransport} transport`
      );
    }

    // Get configured environment variables
    const env = { ...config.env, ...data.configuredEnvVars };

    // Build server configuration based on transport type
    const baseConfig = {
      name: `${serverName}-test-${Date.now()}`,
      description: `Temporary ${activeTransport} server for discovery test`,
      env: Object.keys(env).length > 0 ? env : undefined,
    };

    switch (activeTransport) {
      case 'stdio':
        return {
          ...baseConfig,
          type: McpServerType.STDIO,
          command: config.command || 'npx',
          args: config.args || ['-y', config.packageName],
        };

      case 'streamable-http':
        return {
          ...baseConfig,
          type: McpServerType.STREAMABLE_HTTP,
          url: config.url || '',
          streamableHTTPOptions: {
            headers: config.headers,
          },
        };

      case 'docker':
        return {
          ...baseConfig,
          type: McpServerType.STDIO, // Docker runs as STDIO
          command: config.command || 'docker',
          args: config.args || ['run', '--rm', '-i', config.dockerImage],
        };

      default:
        throw new Error(`Unsupported transport type: ${activeTransport}`);
    }
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
        skipDiscovery: true, // Skip automatic discovery for temporary testing server
      });

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to create temporary server');
      }

      // Store the server UUID for discovery
      setTempServerUuid(result.data.uuid);

      // Update wizard with server config
      const configUpdate: any = {
        type: serverConfig.type,
      };

      if ('command' in serverConfig) {
        configUpdate.command = serverConfig.command;
        configUpdate.args = serverConfig.args;
      }

      if ('url' in serverConfig) {
        configUpdate.url = serverConfig.url;
      }

      onUpdate({
        serverConfig: configUpdate,
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
        description:
          error instanceof Error
            ? error.message
            : 'Failed to run discovery test',
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
    if (tempServerUuid && currentProfile?.uuid) {
      try {
        const { deleteMcpServerByUuid } = await import(
          '@/app/actions/mcp-servers'
        );
        await deleteMcpServerByUuid(currentProfile.uuid, tempServerUuid);
      } catch (error) {
        console.error('Error deleting temporary server:', error);
      }
      setTempServerUuid(null);
    }
  };

  const getCapabilityIcon = (type: 'tools' | 'resources' | 'prompts') => {
    switch (type) {
      case 'tools':
        return <Wrench className='h-4 w-4' />;
      case 'resources':
        return <FileText className='h-4 w-4' />;
      case 'prompts':
        return <MessageSquare className='h-4 w-4' />;
    }
  };

  const getCapabilityCount = () => {
    if (!discoveryResult || !discoveryResult.success)
      return { tools: 0, resources: 0, prompts: 0 };
    return {
      tools: discoveryResult.tools?.length || 0,
      resources: discoveryResult.resources?.length || 0,
      prompts: discoveryResult.prompts?.length || 0,
    };
  };

  const counts = getCapabilityCount();
  const totalCapabilities = counts.tools + counts.resources + counts.prompts;

  return (
    <div className='space-y-6'>
      <div>
        <h2 className='text-2xl font-semibold mb-2'>Test Server Discovery</h2>
        <p className='text-muted-foreground'>
          Select transport types and run a discovery test to verify the server
          works correctly.
        </p>
      </div>

      {/* Transport Selection */}
      <Card>
        <CardHeader>
          <CardTitle className='text-sm'>Select Transport Types</CardTitle>
          <CardDescription>
            Choose which transport methods this server supports
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            {transportOptions.map((transport) => {
              const Icon = transport.icon;
              const isSelected = selectedTransports.includes(transport.value);
              const config = detectedConfigs[transport.value];

              return (
                <label
                  key={transport.value}
                  className={`relative flex flex-col gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground'
                  }`}>
                  <div className='flex items-start gap-3'>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() =>
                        handleTransportToggle(transport.value)
                      }
                      className='mt-0.5'
                    />
                    <div className='flex-1'>
                      <div className='flex items-center gap-2 mb-1'>
                        <Icon className='h-4 w-4' />
                        <span className='font-medium'>{transport.label}</span>
                      </div>
                      <p className='text-sm text-muted-foreground'>
                        {transport.description}
                      </p>

                      {/* Show detection confidence */}
                      {config && (
                        <div className='mt-2 text-xs'>
                          <Badge
                            variant={
                              config.confidence > 0.7 ? 'default' : 'secondary'
                            }>
                            {Math.round(config.confidence * 100)}% confidence
                          </Badge>
                          <span className='ml-2 text-muted-foreground'>
                            via {config.source}
                          </span>
                        </div>
                      )}

                      {/* Show detected package/image name */}
                      {config &&
                        transport.value === 'stdio' &&
                        config.packageName && (
                          <p className='mt-1 text-xs font-mono text-muted-foreground'>
                            {config.packageName}
                          </p>
                        )}
                      {config &&
                        transport.value === 'docker' &&
                        config.dockerImage && (
                          <p className='mt-1 text-xs font-mono text-muted-foreground'>
                            {config.dockerImage}
                          </p>
                        )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {isDetecting && (
            <div className='mt-4 flex items-center gap-2 text-sm text-muted-foreground'>
              <Loader2 className='h-4 w-4 animate-spin' />
              Detecting package configurations...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Transport Configuration */}
      {selectedTransports.length > 0 && (
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-sm'>Test Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedTransports.length > 1 && (
              <div className='mb-4'>
                <Label className='text-sm'>Active Transport for Testing</Label>
                <Tabs
                  value={activeTransport}
                  onValueChange={(v) => setActiveTransport(v as TransportType)}>
                  <TabsList
                    className='grid w-full'
                    style={{
                      gridTemplateColumns: `repeat(${selectedTransports.length}, 1fr)`,
                    }}>
                    {selectedTransports.map((transport) => {
                      const option = transportOptions.find(
                        (o) => o.value === transport
                      )!;
                      return (
                        <TabsTrigger
                          key={transport}
                          value={transport}
                          className='flex items-center gap-2'>
                          <option.icon className='h-4 w-4' />
                          {option.label}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </Tabs>
              </div>
            )}

            <div className='space-y-2 text-sm'>
              <div className='flex items-center justify-between'>
                <span className='text-muted-foreground'>Repository:</span>
                <span className='font-mono'>
                  {data.owner}/{data.repo}
                </span>
              </div>

              {detectedConfigs[activeTransport] && (
                <>
                  {activeTransport === 'stdio' && (
                    <>
                      <div className='flex items-center justify-between'>
                        <span className='text-muted-foreground'>Command:</span>
                        <span className='font-mono'>
                          {detectedConfigs[activeTransport].command}
                        </span>
                      </div>
                      <div className='flex items-center justify-between'>
                        <span className='text-muted-foreground'>Package:</span>
                        <span className='font-mono'>
                          {detectedConfigs[activeTransport].packageName ||
                            detectedConfigs[activeTransport].args?.join(' ')}
                        </span>
                      </div>
                    </>
                  )}

                  {activeTransport === 'docker' && (
                    <>
                      <div className='flex items-center justify-between'>
                        <span className='text-muted-foreground'>Image:</span>
                        <span className='font-mono'>
                          {detectedConfigs[activeTransport].dockerImage}
                        </span>
                      </div>
                    </>
                  )}

                  {activeTransport === 'streamable-http' && (
                    <>
                      <div className='flex items-center justify-between'>
                        <span className='text-muted-foreground'>URL:</span>
                        <span className='font-mono text-xs'>
                          {detectedConfigs[activeTransport].url}
                        </span>
                      </div>
                    </>
                  )}

                  <div className='flex items-center justify-between'>
                    <span className='text-muted-foreground'>
                      Detection Confidence:
                    </span>
                    <Badge
                      variant={
                        detectedConfigs[activeTransport].confidence > 0.7
                          ? 'default'
                          : 'secondary'
                      }>
                      {Math.round(
                        detectedConfigs[activeTransport].confidence * 100
                      )}
                      %
                    </Badge>
                  </div>
                </>
              )}

              {data.configuredEnvVars &&
                Object.keys(data.configuredEnvVars).length > 0 && (
                  <div className='flex items-center justify-between'>
                    <span className='text-muted-foreground'>
                      Environment Variables:
                    </span>
                    <span>
                      {Object.keys(data.configuredEnvVars).length} configured
                    </span>
                  </div>
                )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test button */}
      {!discoveryResult && selectedTransports.length > 0 && (
        <div className='flex justify-center'>
          <Button
            size='lg'
            onClick={runDiscoveryTest}
            disabled={
              isRunning ||
              selectedTransports.length === 0 ||
              !detectedConfigs[activeTransport]
            }
            className='flex items-center gap-2'>
            {isRunning ? (
              <>
                <Loader2 className='h-4 w-4 animate-spin' />
                Testing {activeTransport.toUpperCase()} Server...
              </>
            ) : (
              <>
                <PlayCircle className='h-4 w-4' />
                Test {activeTransport.toUpperCase()} Discovery
              </>
            )}
          </Button>
        </div>
      )}

      {/* Discovery results */}
      {discoveryResult && (
        <div className='space-y-4'>
          {/* Status alert */}
          <Alert
            className={
              discoveryResult.success
                ? 'border-green-600'
                : 'border-destructive'
            }>
            {discoveryResult.success ? (
              <CheckCircle2 className='h-4 w-4 text-green-600' />
            ) : (
              <AlertCircle className='h-4 w-4' />
            )}
            <AlertDescription className='flex items-center justify-between'>
              <div>
                {discoveryResult.success ? (
                  <>
                    <strong>Discovery successful!</strong>
                    <p className='text-sm mt-1'>
                      Found {totalCapabilities} capabilities: {counts.tools}{' '}
                      tools, {counts.resources} resources, {counts.prompts}{' '}
                      prompts
                    </p>
                  </>
                ) : (
                  <>
                    <strong>Discovery failed</strong>
                    {discoveryResult.error && (
                      <p className='text-sm mt-1'>{discoveryResult.error}</p>
                    )}
                  </>
                )}
              </div>
              <Button
                variant='ghost'
                size='sm'
                onClick={runDiscoveryTest}
                disabled={isRunning}>
                <RefreshCw className='h-4 w-4' />
              </Button>
            </AlertDescription>
          </Alert>

          {/* Capabilities tabs */}
          {discoveryResult.success && totalCapabilities > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className='text-sm'>
                  Discovered Capabilities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue='tools' className='w-full'>
                  <TabsList className='grid w-full grid-cols-3'>
                    <TabsTrigger
                      value='tools'
                      className='flex items-center gap-2'>
                      {getCapabilityIcon('tools')}
                      Tools ({counts.tools})
                    </TabsTrigger>
                    <TabsTrigger
                      value='resources'
                      className='flex items-center gap-2'>
                      {getCapabilityIcon('resources')}
                      Resources ({counts.resources})
                    </TabsTrigger>
                    <TabsTrigger
                      value='prompts'
                      className='flex items-center gap-2'>
                      {getCapabilityIcon('prompts')}
                      Prompts ({counts.prompts})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value='tools'>
                    <ScrollArea className='h-[200px] w-full'>
                      {discoveryResult.tools &&
                      discoveryResult.tools.length > 0 ? (
                        <div className='space-y-2'>
                          {discoveryResult.tools.map((tool, index) => (
                            <div key={index} className='p-2 border rounded-md'>
                              <div className='flex items-start gap-2'>
                                <Code className='h-4 w-4 text-muted-foreground mt-0.5' />
                                <div className='flex-1'>
                                  <p className='font-mono text-sm'>
                                    {tool.name}
                                  </p>
                                  {tool.description && (
                                    <p className='text-xs text-muted-foreground mt-1'>
                                      {tool.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className='text-sm text-muted-foreground text-center py-4'>
                          No tools discovered
                        </p>
                      )}
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value='resources'>
                    <ScrollArea className='h-[200px] w-full'>
                      {discoveryResult.resources &&
                      discoveryResult.resources.length > 0 ? (
                        <div className='space-y-2'>
                          {discoveryResult.resources.map((resource, index) => (
                            <div key={index} className='p-2 border rounded-md'>
                              <div className='flex items-start gap-2'>
                                <FileText className='h-4 w-4 text-muted-foreground mt-0.5' />
                                <div className='flex-1'>
                                  <p className='font-mono text-sm'>
                                    {resource.uri}
                                  </p>
                                  {resource.name && (
                                    <p className='text-xs text-muted-foreground mt-1'>
                                      {resource.name}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className='text-sm text-muted-foreground text-center py-4'>
                          No resources discovered
                        </p>
                      )}
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value='prompts'>
                    <ScrollArea className='h-[200px] w-full'>
                      {discoveryResult.prompts &&
                      discoveryResult.prompts.length > 0 ? (
                        <div className='space-y-2'>
                          {discoveryResult.prompts.map((prompt, index) => (
                            <div key={index} className='p-2 border rounded-md'>
                              <div className='flex items-start gap-2'>
                                <MessageSquare className='h-4 w-4 text-muted-foreground mt-0.5' />
                                <div className='flex-1'>
                                  <p className='font-mono text-sm'>
                                    {prompt.name}
                                  </p>
                                  {prompt.description && (
                                    <p className='text-xs text-muted-foreground mt-1'>
                                      {prompt.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className='text-sm text-muted-foreground text-center py-4'>
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
