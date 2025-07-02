'use client';

import { AlertCircle, CheckCircle2, Eye, GitBranch, Github, Info, Loader2, Package, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { 
  addUnclaimedServer,
  fetchRegistryServer,
  verifyGitHubOwnership 
} from '@/app/actions/registry-servers';
import { testMcpConnection } from '@/app/actions/test-mcp-connection';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { McpServerSource, McpServerStatus, McpServerType } from '@/db/schema';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

import { ServerDetailDialog } from './server-detail-dialog';

interface IntelligentServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (configs: ParsedConfig[]) => Promise<void>;
  isSubmitting?: boolean;
  existingServers?: Array<{
    name: string;
    command?: string;
    args?: string[];
    url?: string;
    external_id?: string;
    source?: string;
  }>;
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
  // Additional fields for unclaimed servers
  repositoryUrl?: string;
  // Registry data for detail view
  registryData?: {
    id: string;
    name: string;
    description?: string;
    author?: string;
    license?: string;
    homepage?: string;
    repository?: string;
    version?: string;
    downloads?: number;
    stars?: number;
    created_at?: string;
    updated_at?: string;
    tags?: string[];
    readme?: string;
  };
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

interface DetectionState {
  isDetecting: boolean;
  progress: number;
  message?: string;
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

export function IntelligentServerDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
  existingServers = []
}: IntelligentServerDialogProps) {
  const { t: _t } = useTranslation();
  const { session: _session } = useAuth();
  const [input, setInput] = useState('');
  const [analysis, setAnalysis] = useState<InputAnalysis | null>(null);
  const [parsedConfigs, setParsedConfigs] = useState<ParsedConfig[]>([]);
  const [testResults, setTestResults] = useState<Map<string, TestResult>>(new Map());
  const [selectedConfigs, setSelectedConfigs] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [detectionState, setDetectionState] = useState<DetectionState>({
    isDetecting: false,
    progress: 0
  });
  const [ownershipStatus, setOwnershipStatus] = useState<{
    isChecking: boolean;
    isOwner: boolean | null;
    message?: string;
    needsAuth?: boolean;
  }>({
    isChecking: false,
    isOwner: null
  });
  const [showAutoDetection, setShowAutoDetection] = useState(false);
  const [selectedServerForDetail, setSelectedServerForDetail] = useState<ParsedConfig | null>(null);
  const [registryToken, setRegistryToken] = useState<string | null>(null);
  const [githubUsername, setGithubUsername] = useState<string | null>(null);

  // Check if a server configuration is a duplicate
  const isDuplicate = (config: ParsedConfig): boolean => {
    return existingServers.some(existing => {
      // Check by external_id for registry/community servers
      if (config.external_id && existing.external_id) {
        return config.external_id === existing.external_id;
      }
      
      // Check by URL for URL-based servers
      if (config.url && existing.url) {
        return config.url === existing.url;
      }
      
      // Check by command + args for STDIO servers
      if (config.command && existing.command) {
        const configArgs = (config.args || []).join(' ');
        const existingArgs = (existing.args || []).join(' ');
        return config.command === existing.command && configArgs === existingArgs;
      }
      
      // Fallback to name comparison
      return config.name === existing.name;
    });
  };

  const initiateGitHubOAuth = () => {
    const redirectUri = getRedirectUri();
    const scope = 'read:user,read:org';
    const githubOAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    // Open OAuth in a popup window
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    
    const popup = window.open(
      githubOAuthUrl,
      'github-oauth',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
    );
    
    // Listen for messages from the popup
    const handleMessage = (event: MessageEvent) => {
      // Verify origin for security
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'github-oauth-success' && event.data.accessToken) {
        setRegistryToken(event.data.accessToken);
        
        // Get GitHub username
        fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${event.data.accessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        })
          .then(res => res.json())
          .then(data => {
            if (data.login) {
              setGithubUsername(data.login);
              toast.success(`Authenticated as @${data.login}`);
              
              // Re-run the GitHub URL analysis if we have input
              if (input && isGitHubUrl(input)) {
                // Reset ownership status to trigger re-check
                setOwnershipStatus({ isChecking: false, isOwner: null });
                analyzeInput(input, event.data.accessToken);
              }
            }
          })
          .catch(console.error);
        
        // Clean up
        window.removeEventListener('message', handleMessage);
        if (popup && !popup.closed) {
          popup.close();
        }
      } else if (event.data.type === 'github-oauth-error') {
        toast.error(`Authentication failed: ${event.data.error}`);
        window.removeEventListener('message', handleMessage);
      }
    };
    
    window.addEventListener('message', handleMessage);
    
    // Check if popup was blocked
    if (!popup || popup.closed) {
      toast.error('Please allow popups for this site to authenticate with GitHub');
      window.removeEventListener('message', handleMessage);
    }
  };

  // GitHub OAuth configuration - use different client IDs for different environments
  const getGitHubClientId = () => {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      if (origin.includes('localhost')) {
        return 'Ov23liauuJvy6sLzrDdr'; // Localhost client ID
      } else if (origin.includes('staging')) {
        return 'Ov23liGQCDAID0kY58HE'; // Staging client ID
      } else {
        return '13219bd31987f25b7e34'; // Production client ID
      }
    }
    return 'Ov23liauuJvy6sLzrDdr'; // Default to localhost
  };
  
  const GITHUB_CLIENT_ID = getGitHubClientId();
  
  // Always use our custom registry callback for the registry OAuth
  const getRedirectUri = () => {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      return `${origin}/api/auth/callback/registry`;
    }
    return 'https://staging.plugged.in/api/auth/callback/registry';
  };

  // Restore saved state when dialog opens
  useEffect(() => {
    if (open && registryToken) {
      // If we have a token from a previous auth, fetch username
      fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${registryToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })
        .then(res => res.json())
        .then(data => {
          if (data.login) {
            setGithubUsername(data.login);
          }
        })
        .catch(console.error);
    }
  }, [open, registryToken]);

  // Analyze input whenever it changes
  useEffect(() => {
    if (!input.trim()) {
      setAnalysis(null);
      setParsedConfigs([]);
      setOwnershipStatus({ isChecking: false, isOwner: null });
      return;
    }

    const timer = setTimeout(() => {
      analyzeInput(input);
    }, 500); // Debounce

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const analyzeInput = async (inputText: string, currentRegistryToken?: string) => {
    setIsAnalyzing(true);
    const trimmed = inputText.trim();
    
    try {
      // Check if it's a registry format (io.github.owner/repo)
      if (isRegistryFormat(trimmed)) {
        await handleRegistryInput(trimmed);
      }
      // Check if it's a GitHub URL
      else if (isGitHubUrl(trimmed)) {
        await handleGitHubUrl(trimmed, currentRegistryToken);
      }
      // Check if it's a URL
      else if (isValidUrl(trimmed)) {
        handleUrlInput(trimmed);
      }
      // Check if it's JSON
      else if (trimmed.startsWith('{')) {
        handleJsonInput(trimmed);
      }
      // Check for command patterns
      else if (trimmed.includes('npx') || trimmed.includes('npm') || trimmed.includes('node')) {
        handleCommandInput(trimmed);
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

  const isRegistryFormat = (text: string): boolean => {
    const registryPattern = /^io\.github\.[^\/]+\/[^\/]+/;
    return registryPattern.test(text);
  };

  const isGitHubUrl = (text: string): boolean => {
    return text.startsWith('https://github.com/') || text.startsWith('github.com/');
  };

  const handleRegistryInput = async (registryId: string) => {
    setDetectionState({ isDetecting: true, progress: 30, message: 'Fetching from registry...' });
    
    try {
      const config = await parseRegistryInput(registryId);
      
      if (config) {
        setAnalysis({
          type: 'registry',
          serverType: config.type,
          data: config,
          registryData: config.registryData
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
    } finally {
      setDetectionState({ isDetecting: false, progress: 0 });
    }
  };

  const handleGitHubUrl = async (githubUrl: string, currentRegistryToken?: string) => {
    setDetectionState({ isDetecting: true, progress: 20, message: 'Analyzing GitHub repository...' });
    setShowAutoDetection(true);
    
    try {
      // Extract owner and repo
      const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        throw new Error('Invalid GitHub URL');
      }

      const [, owner, repo] = match;
      const registryId = `io.github.${owner}/${repo}`;

      // Check ownership using registry token
      setOwnershipStatus({ isChecking: true, isOwner: null });
      setDetectionState({ isDetecting: true, progress: 40, message: 'Checking ownership...' });
      
      const ownership = await verifyGitHubOwnership(currentRegistryToken || registryToken || '', githubUrl);
      setOwnershipStatus({
        isChecking: false,
        isOwner: ownership.isOwner,
        message: ownership.reason || undefined,
        needsAuth: ownership.needsAuth
      });

      setDetectionState({ isDetecting: true, progress: 60, message: 'Checking registry...' });
      
      // Try to fetch from registry first
      const registryConfig = await parseRegistryInput(registryId);
      
      if (registryConfig) {
        setAnalysis({
          type: 'registry',
          serverType: registryConfig.type,
          data: registryConfig,
          registryData: registryConfig.registryData
        });
        
        setParsedConfigs([{
          ...registryConfig,
          repositoryUrl: githubUrl
        }]);
        setSelectedConfigs(new Set([registryConfig.name]));
      } else {
        // Not in registry, analyze repository for configuration
        setDetectionState({ isDetecting: true, progress: 80, message: 'Analyzing repository configuration...' });
        
        try {
          // Analyze repository to get environment variables
          const analysisResponse = await fetch(`/api/analyze-repository?url=${encodeURIComponent(githubUrl)}`);
          
          const envVars: Record<string, string> = {};
          let detectedConfig: any = null;
          
          if (analysisResponse.ok) {
            const analysisData = await analysisResponse.json();
            
            // Check if we found MCP configuration
            if (analysisData.mcpConfig) {
              detectedConfig = analysisData.mcpConfig;
            }
            
            // Get environment variables
            if (analysisData.envVariables && analysisData.envVariables.length > 0) {
              analysisData.envVariables.forEach((envVar: any) => {
                envVars[envVar.name] = '';
              });
            }
          }
          
          // If we found actual MCP config, use it
          if (detectedConfig?.mcpServers) {
            const firstServerName = Object.keys(detectedConfig.mcpServers)[0];
            const firstServer = detectedConfig.mcpServers[firstServerName];
            
            const config: ParsedConfig = {
              name: firstServerName || repo,
              type: McpServerType.STDIO,
              description: firstServer.description || `MCP server from ${owner}/${repo}`,
              command: firstServer.command || 'npx',
              args: firstServer.args || [`@${owner}/${repo}`],
              env: firstServer.env || envVars,
              status: McpServerStatus.ACTIVE,
              source: McpServerSource.GITHUB,
              external_id: `${owner}/${repo}`,
              repositoryUrl: githubUrl
            };
            
            setAnalysis({
              type: 'github',
              serverType: McpServerType.STDIO,
              data: config
            });
            
            setParsedConfigs([config]);
            setSelectedConfigs(new Set([config.name]));
          } else {
            // Create config with detected env vars
            const config: ParsedConfig = {
              name: repo,
              type: McpServerType.STDIO,
              description: `MCP server from ${owner}/${repo}`,
              command: 'npx',
              args: [`-y`, `@${owner}/${repo}@latest`],
              env: Object.keys(envVars).length > 0 ? envVars : undefined,
              status: McpServerStatus.ACTIVE,
              source: McpServerSource.GITHUB,
              external_id: `${owner}/${repo}`,
              repositoryUrl: githubUrl
            };
            
            setAnalysis({
              type: 'github',
              serverType: McpServerType.STDIO,
              data: config
            });
            
            setParsedConfigs([config]);
            setSelectedConfigs(new Set([config.name]));
          }
        } catch (error) {
          console.error('Error analyzing repository:', error);
          // Fallback to basic config
          const config: ParsedConfig = {
            name: repo,
            type: McpServerType.STDIO,
            description: `MCP server from ${owner}/${repo}`,
            command: 'npx',
            args: [`-y`, `@${owner}/${repo}@latest`],
            status: McpServerStatus.ACTIVE,
            source: McpServerSource.GITHUB,
            external_id: `${owner}/${repo}`,
            repositoryUrl: githubUrl
          };
          
          setAnalysis({
            type: 'github',
            serverType: McpServerType.STDIO,
            data: config
          });
          
          setParsedConfigs([config]);
          setSelectedConfigs(new Set([config.name]));
        }
      }
    } catch (error) {
      console.error('Error handling GitHub URL:', error);
      setAnalysis({
        type: 'github',
        error: error instanceof Error ? error.message : 'Failed to analyze repository',
        suggestions: [
          'Check if the URL is correct',
          'Ensure the repository is public',
          'Try again later'
        ]
      });
    } finally {
      setDetectionState({ isDetecting: false, progress: 0 });
    }
  };

  const handleUrlInput = (url: string) => {
    const serverType = detectServerTypeFromUrl(url);
    const config = parseUrlInput(url, serverType);
    
    setAnalysis({
      type: 'url',
      serverType,
      data: config
    });
    
    setParsedConfigs([config]);
    setSelectedConfigs(new Set([config.name]));
  };

  const handleJsonInput = (jsonText: string) => {
    try {
      const parsed = JSON.parse(jsonText);
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
  };

  const handleCommandInput = (cmd: string) => {
    const config = parseCommandString(cmd);
    
    setAnalysis({
      type: 'command',
      serverType: McpServerType.STDIO,
      data: config
    });
    
    setParsedConfigs([config]);
    setSelectedConfigs(new Set([config.name]));
  };

  const detectServerTypeFromUrl = (url: string): McpServerType => {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      const pathname = urlObj.pathname.toLowerCase();
      
      if (hostname === 'server.smithery.ai' || 
          hostname === 'api.githubcopilot.com' ||
          hostname === 'mcp.context7.com') {
        return McpServerType.STREAMABLE_HTTP;
      }
      
      if (pathname.endsWith('/sse') || pathname.includes('/sse/') ||
          pathname.endsWith('/events') || pathname.includes('/events/') ||
          pathname.endsWith('/stream') || pathname.includes('/stream/')) {
        return McpServerType.SSE;
      }
      
      return McpServerType.STREAMABLE_HTTP;
    } catch {
      return McpServerType.STREAMABLE_HTTP;
    }
  };

  const parseUrlInput = (url: string, serverType: McpServerType): ParsedConfig => {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    let name = hostname.replace(/\./g, '-');
    
    if (hostname === 'mcp.context7.com') {
      name = 'context7';
    } else if (hostname === 'server.smithery.ai') {
      const pathMatch = urlObj.pathname.match(/@[^/]+\/([^/]+)\//);
      if (pathMatch && pathMatch[1]) {
        name = pathMatch[1];
      } else {
        name = 'smithery-server';
      }
    } else if (hostname === 'api.githubcopilot.com') {
      name = 'github-copilot';
    } else {
      name += '-server';
    }
    
    const apiKey = urlObj.searchParams.get('api_key') || urlObj.searchParams.get('apiKey');
    
    const config: ParsedConfig = {
      name,
      type: serverType,
      url: url,
      status: McpServerStatus.ACTIVE
    };
    
    if (hostname === 'server.smithery.ai') {
      // API key stays in URL for Smithery servers
    } else if (apiKey && serverType === McpServerType.STREAMABLE_HTTP) {
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
    
    if (json.mcpServers) {
      for (const [name, config] of Object.entries(json.mcpServers)) {
        const parsed = parseSingleConfig(name, config as any);
        if (parsed) configs.push(parsed);
      }
    } else if (json.command || json.url) {
      const parsed = parseSingleConfig('imported-server', json);
      if (parsed) configs.push(parsed);
    }
    
    return configs;
  };

  const parseSingleConfig = (name: string, config: any): ParsedConfig | null => {
    if (config.command) {
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
    
    if (config.url) {
      const serverType = config.type === 'sse' ? McpServerType.SSE : 
                        config.type === 'streamable_http' ? McpServerType.STREAMABLE_HTTP :
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
    
    return null;
  };

  const parseEnv = (env: any): Record<string, string> => {
    if (!env) return {};
    
    const result: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string') {
        result[key] = value;
      }
    }
    
    return result;
  };

  const parseCommandString = (cmd: string): ParsedConfig => {
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);
    
    let name = 'imported-server';
    const packageArg = args.find(arg => arg.startsWith('@'));
    if (packageArg) {
      name = packageArg.split('/').pop() || name;
    }
    
    return {
      name,
      type: McpServerType.STDIO,
      command,
      args,
      status: McpServerStatus.ACTIVE
    };
  };

  const parseRegistryInput = async (registryId: string): Promise<ParsedConfig | null> => {
    try {
      const result = await fetchRegistryServer(registryId);
      
      if (!result.success || !result.data) {
        return null;
      }

      const server = result.data;
      const primaryPackage = server.packages?.[0];

      if (primaryPackage) {
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
            if (primaryPackage.name?.endsWith('.py')) {
              command = 'python';
              args = [primaryPackage.name];
            } else {
              command = 'node';
              args = [primaryPackage.name];
            }
        }

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
          external_id: server.id,
          // Store full registry data for detail view
          registryData: {
            id: server.id,
            name: server.name,
            description: server.description,
            repository: server.repository?.url,
            version: server.version_detail?.version,
            author: server.repository?.id ? server.repository.id.split('/')[0] : undefined,
            // license: primaryPackage.license, // Not available in current API
            homepage: server.repository?.url,
            tags: [], // server.tags || [], // Not available in current API
            // created_at: server.created_at, // Not available in current API
            updated_at: server.version_detail?.release_date,
            // downloads: server.downloads, // Not available in current API
            // stars: server.stars // Not available in current API
          }
        } as ParsedConfig;
      }

      return null;
    } catch (error) {
      console.error('Error parsing registry input:', error);
      return null;
    }
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
      });
      
      setTestResults(prev => new Map(prev).set(testId, {
        success: result.success,
        message: result.message,
        details: result.details,
      }));
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
    
    if (configsToSubmit.length === 0) return;

    // If we have a GitHub URL and the user is not the owner, save as unclaimed
    if (configsToSubmit.length === 1 && 
        configsToSubmit[0].repositoryUrl && 
        ownershipStatus.isOwner === false) {
      
      try {
        const config = configsToSubmit[0];
        const result = await addUnclaimedServer({
          repositoryUrl: config.repositoryUrl || '',
          description: config.description,
          metadata: {
            command: config.command,
            args: config.args,
            env: config.env
          }
        });

        if (result.success) {
          toast.success('Server added as unclaimed. You can claim it later if you own the repository.');
          handleClose();
        } else {
          toast.error(result.error || 'Failed to add server');
        }
      } catch (_error) {
        toast.error('Failed to add unclaimed server');
      }
    } else {
      // Normal flow - add to profile
      await onSubmit(configsToSubmit);
      handleClose();
    }
  };

  const handleClose = () => {
    setInput('');
    setAnalysis(null);
    setParsedConfigs([]);
    setTestResults(new Map());
    setSelectedConfigs(new Set());
    setOwnershipStatus({ isChecking: false, isOwner: null });
    setShowAutoDetection(false);
    onOpenChange(false);
  };

  const loadExample = (example: keyof typeof EXAMPLES) => {
    setInput(EXAMPLES[example].config);
  };

  const removeConfig = (configName: string) => {
    setParsedConfigs(prev => prev.filter(c => c.name !== configName));
    setSelectedConfigs(prev => {
      const next = new Set(prev);
      next.delete(configName);
      return next;
    });
    setTestResults(prev => {
      const next = new Map(prev);
      next.delete(configName);
      return next;
    });
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Intelligent Add Server
          </DialogTitle>
          <DialogDescription>
            Add MCP servers from the registry, GitHub, or paste configurations. Supports multiple formats and auto-detection.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Registry GitHub Connection Status */}
          {registryToken && githubUsername && (
            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>Registry authenticated as <strong>@{githubUsername}</strong></span>
              </div>
            </div>
          )}

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
              placeholder="Enter a registry ID (io.github.owner/repo), GitHub URL, JSON config, or command..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-h-[120px] font-mono text-sm"
            />
          </div>

          {/* Detection Progress */}
          {detectionState.isDetecting && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {detectionState.message || 'Analyzing...'}
              </div>
              <Progress value={detectionState.progress} className="h-2" />
            </div>
          )}

          {/* Auto-detection Panel */}
          {showAutoDetection && analysis?.type === 'github' && (
            <Collapsible open={showAutoDetection} onOpenChange={setShowAutoDetection}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Auto-detection Details
                  </span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Card>
                  <CardContent className="pt-4 space-y-3">
                    {ownershipStatus.isOwner !== null && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={ownershipStatus.isOwner ? "default" : "secondary"}>
                            {ownershipStatus.isOwner ? "You own this repository" : ownershipStatus.message || "Not your repository"}
                          </Badge>
                        </div>
                        {ownershipStatus.needsAuth && !registryToken && (
                          <Alert>
                            <Github className="h-4 w-4" />
                            <AlertDescription className="flex items-center justify-between">
                              <span>Authenticate with GitHub to verify ownership</span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={initiateGitHubOAuth}
                              >
                                <Github className="h-4 w-4 mr-2" />
                                Authenticate for Registry
                              </Button>
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    )}
                    {analysis.registryData ? (
                      <Alert>
                        <Package className="h-4 w-4" />
                        <AlertDescription>
                          This server is available in the Plugged.in Registry
                        </AlertDescription>
                      </Alert>
                    ) : ownershipStatus.isOwner ? (
                      <Alert>
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertDescription>
                          This server will be added to your profile.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                          This server is not in the registry. It will be added as an unclaimed server.
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Analysis Result */}
          {isAnalyzing && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing input...
            </div>
          )}

          {analysis && !isAnalyzing && analysis.error && (
            <Alert className="border-destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="text-destructive">{analysis.error}</p>
                  {analysis.suggestions && (
                    <ul className="list-disc list-inside text-sm">
                      {analysis.suggestions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Parsed Configurations */}
          {parsedConfigs.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  Detected {parsedConfigs.length} server{parsedConfigs.length > 1 ? 's' : ''}:
                </h3>
                {parsedConfigs.length < 5 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setInput('');
                      setAnalysis(null);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add More
                  </Button>
                )}
              </div>
              
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {parsedConfigs.map((config) => {
                  const testResult = testResults.get(config.name);
                  const isSelected = selectedConfigs.has(config.name);
                  const isConfigDuplicate = isDuplicate(config);
                  
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
                              aria-label={`Select ${config.name}`}
                            />
                            {config.name}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedServerForDetail(config);
                              }}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
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
                            {config.source === McpServerSource.GITHUB && (
                              <Badge 
                                variant="outline" 
                                className="text-xs"
                              >
                                <GitBranch className="h-3 w-3 mr-1" />
                                GitHub
                              </Badge>
                            )}
                            {testResult && (
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
                            )}
                            {isConfigDuplicate && (
                              <Badge 
                                variant="secondary" 
                                className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
                              >
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Duplicate
                              </Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeConfig(config.name);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="text-xs space-y-1">
                        {config.description && (
                          <p className="text-muted-foreground">{config.description}</p>
                        )}
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
                            "text-xs mt-1",
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
              const configsToTest = parsedConfigs.filter(c => selectedConfigs.has(c.name));
              if (configsToTest.length === 0) {
                for (const config of parsedConfigs) {
                  await testServerConfig(config);
                }
              } else {
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
            {ownershipStatus.isOwner === false && selectedConfigs.size === 1 && parsedConfigs[0]?.repositoryUrl
              ? 'Add as Unclaimed'
              : `Add ${selectedConfigs.size} Server${selectedConfigs.size !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      {/* Server Detail Dialog */}
      {selectedServerForDetail && (
        <ServerDetailDialog
          open={!!selectedServerForDetail}
          onOpenChange={(open) => {
            if (!open) setSelectedServerForDetail(null);
          }}
          server={{
            ...selectedServerForDetail,
            registryData: selectedServerForDetail.registryData
          }}
          onDelete={() => {
            // Remove from parsed configs
            removeConfig(selectedServerForDetail.name);
            setSelectedServerForDetail(null);
          }}
          canDelete={true}
          onUpdate={(updatedServer) => {
            // Update the config in parsedConfigs
            const updatedConfigs = parsedConfigs.map(c => 
              c.name === selectedServerForDetail.name 
                ? { ...c, env: updatedServer.env }
                : c
            );
            setParsedConfigs(updatedConfigs);
            // Update the selected server detail
            setSelectedServerForDetail({ ...selectedServerForDetail, env: updatedServer.env });
          }}
        />
      )}
    </>
  );
}