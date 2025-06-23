'use client';

import { AlertCircle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
import { McpServerStatus, McpServerType } from '@/db/schema';
import { cn } from '@/lib/utils';

interface SmartServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (configs: ParsedConfig[]) => Promise<void>;
  isSubmitting: boolean;
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
}

interface InputAnalysis {
  type: 'url' | 'json' | 'command' | 'unknown';
  serverType?: McpServerType;
  data?: any;
  error?: string;
  suggestions?: string[];
}

interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}

// Example configurations
const EXAMPLES = {
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
  github: {
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
  isSubmitting
}: SmartServerDialogProps) {
  const { } = useTranslation();
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
      // Check if it's a URL
      if (isValidUrl(trimmed)) {
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
    const urlLower = url.toLowerCase();
    
    // Smithery servers
    if (urlLower.includes('server.smithery.ai')) {
      return McpServerType.STREAMABLE_HTTP;
    }
    
    // GitHub Copilot
    if (urlLower.includes('api.githubcopilot.com')) {
      return McpServerType.STREAMABLE_HTTP;
    }
    
    // Context7
    if (urlLower.includes('mcp.context7.com')) {
      return McpServerType.STREAMABLE_HTTP;
    }
    
    // SSE endpoints (common patterns)
    if (urlLower.includes('/sse') || urlLower.includes('/events') || urlLower.includes('/stream')) {
      return McpServerType.SSE;
    }
    
    // Default to Streamable HTTP for HTTP(S) URLs
    return McpServerType.STREAMABLE_HTTP;
  };

  const parseUrlInput = (url: string, serverType: McpServerType): ParsedConfig => {
    const urlObj = new URL(url);
    let name = urlObj.hostname.replace(/\./g, '-');
    
    // Create better names for known services
    if (url.includes('mcp.context7.com')) {
      name = 'context7';
    } else if (url.includes('server.smithery.ai')) {
      // Extract server name from Smithery URL
      const match = url.match(/@[^/]+\/([^/]+)\//);;
      if (match) {
        name = match[1];
      }
    } else {
      name += '-server';
    }
    
    // Extract API key if present
    const apiKey = urlObj.searchParams.get('api_key') || urlObj.searchParams.get('apiKey');
    
    const config: ParsedConfig = {
      name,
      type: serverType,
      url: url,
      status: McpServerStatus.ACTIVE
    };
    
    // For Smithery, keep API key in URL
    if (url.includes('server.smithery.ai')) {
      // API key stays in URL
    } else if (apiKey && serverType === McpServerType.STREAMABLE_HTTP) {
      // For other services, move API key to headers
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
    if (configsToSubmit.length > 0) {
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
    onOpenChange(false);
  };

  const loadExample = (example: keyof typeof EXAMPLES) => {
    setInput(EXAMPLES[example].config);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Smart Add Server
          </DialogTitle>
          <DialogDescription>
            Paste a URL, JSON configuration, or command to add MCP servers. Try examples like Context7 for up-to-date documentation.
          </DialogDescription>
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