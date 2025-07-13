'use client';

import { AlertCircle, CheckCircle2, Key,Loader2, Package, Sparkles, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fetchRegistryServer } from '@/app/actions/registry-servers';
import { testMcpConnection } from '@/app/actions/test-mcp-connection';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { McpServerSource, McpServerStatus, McpServerType } from '@/db/schema';
import { cn } from '@/lib/utils';

import { SmartServerWizard } from './smart-server-wizard/SmartServerWizard';

interface SmartServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (configs: ParsedConfig[]) => Promise<void>;
  isSubmitting: boolean;
  onWizardSuccess?: () => void;
  currentProfileUuid?: string;
}

interface ParsedConfig {
  name: string;
  type: McpServerType;
  description?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  transport?: string;
  streamableHTTPOptions?: {
    headers?: Record<string, string>;
    sessionId?: string;
  };
  status?: McpServerStatus;
  source?: McpServerSource;
  external_id?: string;
  config?: Record<string, any>;
}

interface InputAnalysis {
  type: 'url' | 'json' | 'command' | 'registry' | 'github' | 'unknown';
  serverType?: McpServerType;
  data?: any;
  error?: string;
  suggestions?: string[];
  registryData?: any;
}

interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}

// Example configurations
const EXAMPLES = {
  registry: {
    name: 'Registry Server (Filesystem)',
    config: 'io.github.modelcontextprotocol/servers/src/filesystem'
  },
  github: {
    name: 'GitHub URL',
    config: 'https://github.com/modelcontextprotocol/servers'
  },
  context7: {
    name: 'Context7 MCP',
    config: 'https://mcp.context7.com/mcp'
  },
  notion: {
    name: 'Notion API',
    config: `{
  "mcpServers": {
    "notionApi": {
      "command": "npx",
      "args": ["-y", "@notionhq/notion-mcp-server"],
      "env": {
        "OPENAPI_MCP_HEADERS": "{\\"Authorization\\": \\"Bearer ntn_YOUR_API_KEY\\", \\"Notion-Version\\": \\"2022-06-28\\" }"
      }
    }
  }
}`
  },
  smithery: {
    name: 'Smithery Sequential Thinking',
    config: 'https://server.smithery.ai/@smithery-ai/server-sequential-thinking/mcp?api_key=YOUR_KEY'
  },
  githubMcp: {
    name: 'GitHub MCP',
    config: `{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_TOKEN"
      }
    }
  }
}`
  },
  filesystem: {
    name: 'Filesystem',
    config: `{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/directory"]
    }
  }
}`
  }
};

export function SmartServerDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  onWizardSuccess,
  currentProfileUuid
}: SmartServerDialogProps) {
  const { } = useTranslation();
  const [mode, setMode] = useState<'quick' | 'wizard'>('quick');
  const [input, setInput] = useState('');
  const [analysis, setAnalysis] = useState<InputAnalysis | null>(null);
  const [parsedConfigs, setParsedConfigs] = useState<ParsedConfig[]>([]);
  const [testResults, setTestResults] = useState<Map<string, TestResult>>(new Map());
  const [selectedConfigs, setSelectedConfigs] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Analyze input whenever it changes
  useEffect(() => {
    if (!input.trim()) {
      setAnalysis(null);
      setParsedConfigs([]);
      return;
    }

    const timer = setTimeout(() => {
      analyzeInput(input);
    }, 500); // Debounce

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const analyzeInput = async (inputText: string) => {
    setIsAnalyzing(true);
    const trimmed = inputText.trim();
    
    try {
      // Check if it's a registry format (io.github.owner/repo)
      if (isRegistryFormat(trimmed)) {
        const config = await parseRegistryInput(trimmed);
        if (config) {
          setAnalysis({
            type: 'registry',
            serverType: config.type,
            data: config,
            registryData: config
          });
          
          setParsedConfigs([config]);
          setSelectedConfigs(new Set([config.name]));
        } else {
          setAnalysis({
            type: 'registry',
            error: 'Registry server not found',
            suggestions: [
              'Check the registry identifier format',
              'Ensure the server is published to the registry',
              'Try using the GitHub URL instead'
            ]
          });
        }
      }
      // Check if it's a GitHub URL
      else if (isGitHubUrl(trimmed)) {
        const config = await parseGitHubUrl(trimmed);
        
        setAnalysis({
          type: 'github',
          serverType: McpServerType.STDIO,
          data: config
        });
        
        setParsedConfigs([config]);
        setSelectedConfigs(new Set([config.name]));
      }
      // Check if it's a URL
      else if (isValidUrl(trimmed)) {
        const serverType = detectServerTypeFromUrl(trimmed);
        const config = parseUrlInput(trimmed, serverType);
        
        setAnalysis({
          type: 'url',
          serverType,
          data: config
        });
        
        setParsedConfigs([config]);
        setSelectedConfigs(new Set([config.name]));
      }
      // Check if it's JSON
      else if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          const configs = parseJsonConfig(parsed);
          
          setAnalysis({
            type: 'json',
            data: parsed
          });
          
          setParsedConfigs(configs);
          setSelectedConfigs(new Set(configs.map(c => c.name)));
        } catch (_e) {
          setAnalysis({
            type: 'json',
            error: 'Invalid JSON format',
            suggestions: [
              'Check for missing commas or quotes',
              'Ensure proper bracket matching',
              'Validate JSON at jsonlint.com'
            ]
          });
        }
      }
      // Check for command patterns
      else if (trimmed.includes('npx') || trimmed.includes('npm') || trimmed.includes('node')) {
        const config = parseCommandString(trimmed);
        
        setAnalysis({
          type: 'command',
          serverType: McpServerType.STDIO,
          data: config
        });
        
        setParsedConfigs([config]);
        setSelectedConfigs(new Set([config.name]));
      }
      else {
        setAnalysis({
          type: 'unknown',
          error: 'Could not detect input format',
          suggestions: [
            'Enter a registry ID like: io.github.owner/repo',
            'Paste a GitHub URL: https://github.com/owner/repo',
            'Paste a URL for Streamable HTTP/SSE servers',
            'Paste JSON configuration from MCP documentation',
            'Enter a command like: npx @modelcontextprotocol/server-name'
          ]
        });
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const isValidUrl = (text: string): boolean => {
    try {
      new URL(text);
      return true;
    } catch {
      return false;
    }
  };

  const detectServerTypeFromUrl = (url: string): McpServerType => {
    // Since SSE is deprecated and most modern MCP servers support Streamable HTTP,
    // we should default to STREAMABLE_HTTP for all HTTP(S) URLs.
    // Servers will negotiate the best transport method during connection.
    try {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol.toLowerCase();
      
      // For any HTTP(S) URL, use Streamable HTTP (the modern transport)
      if (protocol === 'http:' || protocol === 'https:') {
        return McpServerType.STREAMABLE_HTTP;
      }
      
      // Default to Streamable HTTP
      return McpServerType.STREAMABLE_HTTP;
    } catch (_error) {
      // If URL parsing fails, default to Streamable HTTP
      return McpServerType.STREAMABLE_HTTP;
    }
  };

  const parseUrlInput = (url: string, serverType: McpServerType): ParsedConfig => {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    let name = hostname.replace(/\./g, '-');
    let description = '';
    
    // Create better names for known services based on exact hostname matching
    if (hostname === 'mcp.context7.com') {
      name = 'context7';
      description = 'Context7 MCP Server - Code Documentation Assistant';
    } else if (hostname === 'server.smithery.ai') {
      // Extract server name from Smithery URL path
      const pathMatch = urlObj.pathname.match(/@[^/]+\/([^/]+)\//);
      if (pathMatch && pathMatch[1]) {
        name = pathMatch[1];
      } else {
        name = 'smithery-server';
      }
      description = 'Smithery MCP Server';
    } else if (hostname === 'api.githubcopilot.com') {
      name = 'github-copilot';
      description = 'GitHub Copilot MCP Server';
    } else {
      name += '-server';
      description = `MCP Server from ${hostname}`;
    }
    
    // Extract API key if present
    const apiKey = urlObj.searchParams.get('api_key') || urlObj.searchParams.get('apiKey');
    
    const config: ParsedConfig = {
      name,
      type: serverType,
      url: url,
      description,
      status: McpServerStatus.ACTIVE
    };
    
    // For Smithery, keep API key in URL (their expected format)
    if (hostname === 'server.smithery.ai') {
      // API key stays in URL for Smithery servers
    } else if (apiKey && serverType === McpServerType.STREAMABLE_HTTP) {
      // For other services, move API key to headers for better security
      const cleanUrl = new URL(url);
      cleanUrl.searchParams.delete('api_key');
      cleanUrl.searchParams.delete('apiKey');
      
      config.url = cleanUrl.toString();
      config.streamableHTTPOptions = {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      };
    }
    
    return config;
  };

  const parseJsonConfig = (json: any): ParsedConfig[] => {
    const configs: ParsedConfig[] = [];
    
    // Handle standard MCP format
    if (json.mcpServers) {
      for (const [name, config] of Object.entries(json.mcpServers)) {
        const parsed = parseSingleConfig(name, config as any);
        if (parsed) configs.push(parsed);
      }
    }
    // Handle single server config
    else if (json.command || json.url) {
      const parsed = parseSingleConfig('imported-server', json);
      if (parsed) configs.push(parsed);
    }
    
    return configs;
  };

  const parseSingleConfig = (name: string, config: any): ParsedConfig | null => {
    // Handle STDIO servers
    if (config.command) {
      // Check if this is mcp-remote, which is actually a proxy for remote servers
      const isMcpRemote = config.command === 'npx' && 
                         Array.isArray(config.args) && 
                         config.args.includes('mcp-remote');
      
      if (isMcpRemote && config.args) {
        // Find the URL in the args
        const urlIndex = config.args.findIndex((arg: string) => arg.includes('http'));
        if (urlIndex !== -1) {
          const url = config.args[urlIndex];
          const remoteServerType = detectServerTypeFromUrl(url);
          
          // For mcp-remote, always use STDIO type since it's executed as a process
          // The remote URL is just a parameter for the mcp-remote process
          return {
            name,
            type: McpServerType.STDIO, // mcp-remote is always STDIO
            command: config.command,
            args: config.args,
            url: undefined, // Don't store URL for STDIO servers
            env: parseEnv(config.env),
            description: config.description || `Remote ${remoteServerType} server via mcp-remote`,
            status: McpServerStatus.ACTIVE,
            // Mark this as mcp-remote for special handling
            transport: 'mcp-remote'
          };
        }
      }
      
      // Regular STDIO server
      return {
        name,
        type: McpServerType.STDIO,
        command: config.command,
        args: Array.isArray(config.args) ? config.args : [],
        env: parseEnv(config.env),
        description: config.description,
        status: McpServerStatus.ACTIVE
      };
    }
    
    // Handle URL-based servers
    if (config.url) {
      const serverType = config.type === 'sse' ? McpServerType.SSE : 
                        config.type === 'streamable_http' ? McpServerType.STREAMABLE_HTTP :
                        config.type === 'streamable' ? McpServerType.STREAMABLE_HTTP : // New MCP registry format
                        config.transport === 'streamable' ? McpServerType.STREAMABLE_HTTP : // Alternative field
                        detectServerTypeFromUrl(config.url);
      
      return {
        name,
        type: serverType,
        url: config.url,
        description: config.description,
        streamableHTTPOptions: config.streamableHTTPOptions,
        transport: config.transport,
        status: McpServerStatus.ACTIVE
      };
    }
    
    // Handle new MCP registry schema with remotes section
    if (config.remotes && typeof config.remotes === 'object') {
      // Get the first remote endpoint
      const remoteKeys = Object.keys(config.remotes);
      if (remoteKeys.length > 0) {
        const firstRemote = config.remotes[remoteKeys[0]];
        if (firstRemote.url) {
          const serverType = config.transport === 'sse' ? McpServerType.SSE :
                            config.transport === 'streamable' ? McpServerType.STREAMABLE_HTTP :
                            detectServerTypeFromUrl(firstRemote.url);
          
          const result: ParsedConfig = {
            name,
            type: serverType,
            url: firstRemote.url,
            description: config.description,
            status: McpServerStatus.ACTIVE
          };
          
          // Add headers if present
          if (firstRemote.headers) {
            result.streamableHTTPOptions = {
              headers: firstRemote.headers
            };
          }
          
          return result;
        }
      }
    }
    
    return null;
  };

  const parseEnv = (env: any): Record<string, string> => {
    if (!env) return {};
    
    const result: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string') {
        // Check if this is a stringified JSON (like Notion's OPENAPI_MCP_HEADERS)
        if (key === 'OPENAPI_MCP_HEADERS' && value.startsWith('{') && value.includes('\\\\')) {
          // This is likely escaped JSON, keep as is for compatibility
          result[key] = value;
        } else if (value.startsWith('{') && value.endsWith('}')) {
          // Try to detect if it's meant to be stringified JSON
          try {
            JSON.parse(value);
            // If it parses, it's already valid JSON, use as is
            result[key] = value;
          } catch {
            // If it doesn't parse, it might need to be stringified
            result[key] = value;
          }
        } else {
          result[key] = value;
        }
      }
    }
    
    return result;
  };

  const parseCommandString = (cmd: string): ParsedConfig => {
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);
    
    // Extract package name for the server name
    let name = 'imported-server';
    let description = 'Imported MCP server';
    const packageArg = args.find(arg => arg.startsWith('@'));
    if (packageArg) {
      name = packageArg.split('/').pop() || name;
      description = `MCP server from ${packageArg}`;
    }
    
    return {
      name,
      type: McpServerType.STDIO,
      command,
      args,
      description,
      status: McpServerStatus.ACTIVE
    };
  };

  // Check if input is in registry format (io.github.owner/repo)
  const isRegistryFormat = (text: string): boolean => {
    const registryPattern = /^io\.github\.[^\/]+\/[^\/]+/;
    return registryPattern.test(text);
  };

  // Check if input is a GitHub URL
  const isGitHubUrl = (text: string): boolean => {
    return text.startsWith('https://github.com/') || text.startsWith('github.com/');
  };

  // Parse registry input and fetch server data
  const parseRegistryInput = async (registryId: string): Promise<ParsedConfig | null> => {
    try {
      // Fetch server data from registry
      const result = await fetchRegistryServer(registryId);
      
      if (!result.success || !result.data) {
        return null;
      }

      const server = result.data;
      const primaryPackage = server.packages?.[0];

      // Transform registry data to ParsedConfig
      if (primaryPackage) {
        // Determine command based on package type
        let command = '';
        let args: string[] = [];
        
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
            // Unknown type, try to infer
            if (primaryPackage.name?.endsWith('.py')) {
              command = 'python';
              args = [primaryPackage.name];
            } else {
              command = 'node';
              args = [primaryPackage.name];
            }
        }

        // Extract environment variables
        const env: Record<string, string> = {};
        if (primaryPackage.environment_variables) {
          primaryPackage.environment_variables.forEach((envVar: any) => {
            env[envVar.name] = envVar.defaultValue || '';
          });
        }

        return {
          name: server.name.split('/').pop() || server.name,
          type: McpServerType.STDIO,
          description: server.description,
          command,
          args,
          env: Object.keys(env).length > 0 ? env : undefined,
          status: McpServerStatus.ACTIVE,
          source: McpServerSource.REGISTRY,
          external_id: server.id
        };
      }

      return null;
    } catch (error) {
      console.error('Error parsing registry input:', error);
      return null;
    }
  };

  // Parse GitHub URL and transform to registry format
  const parseGitHubUrl = async (githubUrl: string): Promise<ParsedConfig> => {
    // Extract owner and repo from GitHub URL
    const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      throw new Error('Invalid GitHub URL');
    }

    const [, owner, repo] = match;
    const registryId = `io.github.${owner}/${repo}`;

    // Try to fetch from registry first
    const registryConfig = await parseRegistryInput(registryId);
    if (registryConfig) {
      return registryConfig;
    }

    // If not in registry, create a basic config
    return {
      name: repo,
      type: McpServerType.STDIO,
      description: `MCP server from ${owner}/${repo}`,
      command: 'npx',
      args: [`@${owner}/${repo}`],
      status: McpServerStatus.ACTIVE,
      source: McpServerSource.COMMUNITY,
      external_id: `${owner}/${repo}`
    };
  };

  const testServerConfig = async (config: ParsedConfig) => {
    setIsTesting(true);
    const testId = config.name;
    
    try {
      const result = await testMcpConnection({
        name: config.name,
        type: config.type,
        url: config.url,
        command: config.command,
        args: config.args,
        env: config.env,
        streamableHTTPOptions: config.streamableHTTPOptions,
        transport: config.transport,
      });
      
      setTestResults(prev => new Map(prev).set(testId, {
        success: result.success,
        message: result.message,
        details: result.details,
      }));
      
      // If test shows auth is required, mark the config
      if (result.details?.requiresAuth) {
        setParsedConfigs(prev => prev.map(c => 
          c.name === config.name 
            ? { ...c, config: { ...(c.config as any || {}), requires_auth: true } }
            : c
        ));
      }
    } catch (error) {
      setTestResults(prev => new Map(prev).set(testId, {
        success: false,
        message: error instanceof Error ? error.message : 'Test failed'
      }));
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async () => {
    const configsToSubmit = parsedConfigs.filter(c => selectedConfigs.has(c.name));
    if (configsToSubmit.length > 0) {
      // Include any auth requirements detected during testing
      const configsWithAuthInfo = configsToSubmit.map(config => {
        const testResult = testResults.get(config.name);
        if (testResult?.details?.requiresAuth) {
          // Set requires_auth at the top level of config, not nested
          return {
            ...config,
            config: { 
              ...(typeof config.config === 'object' ? config.config : {}), 
              requires_auth: true 
            }
          };
        }
        return config;
      });
      await onSubmit(configsWithAuthInfo);
      handleClose();
    }
  };

  const handleClose = () => {
    setInput('');
    setAnalysis(null);
    setParsedConfigs([]);
    setTestResults(new Map());
    setSelectedConfigs(new Set());
    onOpenChange(false);
  };

  const loadExample = (example: keyof typeof EXAMPLES) => {
    setInput(EXAMPLES[example].config);
  };

  // Show wizard mode if selected
  if (mode === 'wizard') {
    return (
      <SmartServerWizard
        open={open}
        onOpenChange={(newOpen) => {
          if (!newOpen) {
            setMode('quick'); // Reset to quick mode when closing
          }
          onOpenChange(newOpen);
        }}
        onSuccess={() => {
          setMode('quick');
          onOpenChange(false);
          onWizardSuccess?.();
        }}
        currentProfileUuid={currentProfileUuid}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="space-y-3">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Smart Add Server
            </DialogTitle>
            <DialogDescription>
              Paste a registry ID (io.github.owner/repo), GitHub URL, JSON configuration, or command to add MCP servers.
            </DialogDescription>
            {/* Mode Toggle */}
            <ToggleGroup type="single" value={mode} onValueChange={(value) => value && setMode(value as 'quick' | 'wizard')} className="justify-start">
              <ToggleGroupItem value="quick" aria-label="Quick add mode">
                <Sparkles className="h-4 w-4 mr-2" />
                Quick Add
              </ToggleGroupItem>
              <ToggleGroupItem value="wizard" aria-label="Wizard mode">
                <Wand2 className="h-4 w-4 mr-2" />
                Guided Setup
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Examples Dropdown */}
          <div className="flex items-center gap-2">
            <Label>Examples:</Label>
            <Select onValueChange={loadExample}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Load an example" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EXAMPLES).map(([key, example]) => (
                  <SelectItem key={key} value={key}>
                    {example.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Input Area */}
          <div className="space-y-2">
            <Label htmlFor="server-input">Server Configuration</Label>
            <Textarea
              id="server-input"
              placeholder="Paste a URL, JSON config, or command..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-h-[150px] font-mono text-sm"
            />
          </div>

          {/* Analysis Result */}
          {isAnalyzing && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing input...
            </div>
          )}

          {analysis && !isAnalyzing && (
            <Alert className={cn(
              "border",
              analysis.error ? "border-destructive" : "border-primary"
            )}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span>Detected:</span>
                    <Badge variant={analysis.error ? "destructive" : "default"}>
                      {analysis.type.toUpperCase()}
                    </Badge>
                    {analysis.serverType && (
                      <Badge variant="outline">
                        {analysis.serverType}
                      </Badge>
                    )}
                  </div>
                  {analysis.error && (
                    <>
                      <p className="text-destructive">{analysis.error}</p>
                      {analysis.suggestions && (
                        <ul className="list-disc list-inside text-sm">
                          {analysis.suggestions.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Parsed Configurations */}
          {parsedConfigs.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium">
                Detected {parsedConfigs.length} server{parsedConfigs.length > 1 ? 's' : ''}:
              </h3>
              
              <div className="space-y-2">
                {parsedConfigs.map((config) => {
                  const testResult = testResults.get(config.name);
                  const isSelected = selectedConfigs.has(config.name);
                  
                  return (
                    <Card 
                      key={config.name}
                      className={cn(
                        "cursor-pointer transition-colors",
                        isSelected ? "border-primary" : "border-muted"
                      )}
                      onClick={() => {
                        setSelectedConfigs(prev => {
                          const next = new Set(prev);
                          if (next.has(config.name)) {
                            next.delete(config.name);
                          } else {
                            next.add(config.name);
                          }
                          return next;
                        });
                      }}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded"
                            />
                            {config.name}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {config.type}
                            </Badge>
                            {config.source === McpServerSource.REGISTRY && (
                              <Badge 
                                variant="default" 
                                className="text-xs bg-blue-600 hover:bg-blue-700"
                              >
                                <Package className="h-3 w-3 mr-1" />
                                Registry
                              </Badge>
                            )}
                            {testResult && (
                              <>
                                <Badge 
                                  variant={testResult.success ? "default" : "destructive"}
                                  className="text-xs"
                                >
                                  {testResult.success ? (
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                  ) : (
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                  )}
                                  {testResult.success ? "Tested" : "Failed"}
                                </Badge>
                                {testResult.details?.requiresAuth && (
                                  <Badge 
                                    variant="outline" 
                                    className="text-xs border-orange-500 text-orange-600"
                                  >
                                    <Key className="h-3 w-3 mr-1" />
                                    Auth Required
                                  </Badge>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="text-xs space-y-1">
                        {config.command && (
                          <p><span className="font-medium">Command:</span> {config.command}</p>
                        )}
                        {config.url && (
                          <p><span className="font-medium">URL:</span> {config.url}</p>
                        )}
                        {config.args && config.args.length > 0 && (
                          <p><span className="font-medium">Args:</span> {config.args.join(' ')}</p>
                        )}
                        {config.env && Object.keys(config.env).length > 0 && (
                          <p><span className="font-medium">Env:</span> {Object.keys(config.env).join(', ')}</p>
                        )}
                        {testResult?.message && (
                          <p className={cn(
                            "text-xs",
                            testResult.success ? "text-green-600" : "text-destructive"
                          )}>
                            {testResult.message}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              // Test all selected servers
              const configsToTest = parsedConfigs.filter(c => selectedConfigs.has(c.name));
              if (configsToTest.length === 0) {
                // If nothing selected, test all
                for (const config of parsedConfigs) {
                  await testServerConfig(config);
                }
              } else {
                // Test only selected
                for (const config of configsToTest) {
                  await testServerConfig(config);
                }
              }
            }}
            disabled={parsedConfigs.length === 0 || isTesting || isSubmitting}
          >
            {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Test {selectedConfigs.size > 0 ? 'Selected' : 'All'}
          </Button>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={selectedConfigs.size === 0 || isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add {selectedConfigs.size} Server{selectedConfigs.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}