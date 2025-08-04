import { NextRequest, NextResponse } from 'next/server';

import { createErrorResponse, ErrorResponses, getSafeErrorMessage } from '@/lib/api-errors';
import { RateLimiters } from '@/lib/rate-limiter';

// Validate GitHub owner/repo names to prevent SSRF
function isValidGitHubIdentifier(identifier: string): boolean {
  // GitHub usernames and repo names can contain alphanumeric characters, hyphens, and underscores
  // They cannot start with a hyphen and must be 1-100 characters
  const githubPattern = /^[a-zA-Z0-9][a-zA-Z0-9\-_]{0,99}$/;
  return githubPattern.test(identifier);
}

interface EnvVariable {
  name: string;
  description?: string;
  defaultValue?: string;
  required?: boolean;
  isSecret?: boolean;
}

interface TransportConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  transport?: string;
  headers?: Record<string, string>;
  sessionId?: string;
  oauth?: {
    clientId?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
  };
  source?: 'npm-package' | 'mcp-config' | 'readme' | 'detection';
}

export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await RateLimiters.api(request);
  
  if (!rateLimitResult.allowed) {
    const response = createErrorResponse('Too many requests', 429, 'RATE_LIMIT_EXCEEDED');
    // Add rate limit headers
    response.headers.set('X-RateLimit-Limit', rateLimitResult.limit.toString());
    response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    response.headers.set('X-RateLimit-Reset', rateLimitResult.reset.toString());
    response.headers.set('Retry-After', Math.ceil((rateLimitResult.reset - Date.now()) / 1000).toString());
    return response;
  }
  
  try {
    const { searchParams } = new URL(request.url);
    const repoUrl = searchParams.get('url');

    if (!repoUrl) {
      return ErrorResponses.badRequest('Repository URL is required');
    }

    // Validate URL is from github.com
    let url: URL;
    try {
      url = new URL(repoUrl);
    } catch {
      return ErrorResponses.badRequest('Invalid URL format');
    }
    
    // Only allow github.com URLs to prevent SSRF
    if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
      return ErrorResponses.badRequest('Only GitHub URLs are allowed');
    }
    
    // Extract owner and repo from URL
    const match = url.pathname.match(/^\/([^\/]+)\/([^\/\?]+)/);
    if (!match) {
      return ErrorResponses.badRequest('Invalid GitHub repository URL format');
    }

    const [, owner, repo] = match;
    
    // Validate owner and repo to prevent SSRF attacks
    if (!isValidGitHubIdentifier(owner) || !isValidGitHubIdentifier(repo)) {
      return ErrorResponses.badRequest('Invalid GitHub repository identifiers');
    }
    
    // Use GitHub PAT for better rate limits
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Pluggedin-Registry',
    };
    
    if (process.env.GITHUB_PAT) {
      headers['Authorization'] = `token ${process.env.GITHUB_PAT}`;
    }

    // Check if repository exists
    const repoApiUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const repoCheck = await fetch(repoApiUrl, { headers });
    
    if (!repoCheck.ok) {
      const errorText = await repoCheck.text();
      return NextResponse.json(
        { error: `GitHub API error: ${repoCheck.status} - ${errorText}` },
        { status: repoCheck.status }
      );
    }

    const envVariables: EnvVariable[] = [];
    const transportConfigs: Record<string, TransportConfig> = {};
    
    // Try to fetch MCP configuration files
    const configFiles = [
      { path: 'claude_desktop_config.json', branch: 'main' },
      { path: 'claude_desktop_config.json', branch: 'master' },
      { path: 'mcp.json', branch: 'main' },
      { path: 'mcp.json', branch: 'master' },
    ];

    let mcpConfig = null;
    for (const config of configFiles) {
      try {
        // Use GitHub API to get file contents (avoids CORS issues)
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${config.path}?ref=${config.branch}`;
        const response = await fetch(apiUrl, { headers });
        
        if (response.ok) {
          const data = await response.json();
          // GitHub API returns base64 encoded content
          const content = Buffer.from(data.content, 'base64').toString('utf-8');
          mcpConfig = JSON.parse(content);
          break;
        }
      } catch (e) {
        // Continue to next file
      }
    }

    // Try to fetch package.json to check if this is an npm package
    let packageJson: any = null;
    let npmPackageName: string | null = null;
    
    try {
      const packageJsonUrl = `https://api.github.com/repos/${owner}/${repo}/contents/package.json`;
      const packageResponse = await fetch(packageJsonUrl, { headers });
      
      if (packageResponse.ok) {
        const packageData = await packageResponse.json();
        const packageContent = Buffer.from(packageData.content, 'base64').toString('utf-8');
        packageJson = JSON.parse(packageContent);
        
        // Check if the package exists on npm
        if (packageJson.name) {
          try {
            const npmCheckResponse = await fetch(`https://registry.npmjs.org/${packageJson.name}`);
            if (npmCheckResponse.ok) {
              npmPackageName = packageJson.name;
            }
          } catch (e) {
            // Package doesn't exist on npm, ignore
          }
        }
      }
    } catch (e) {
      // Failed to fetch or parse package.json, continue
    }

    if (mcpConfig?.mcpServers) {
      // Extract configuration from all servers
      for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
        const config = serverConfig as any;
        
        // Store transport configuration
        let transportConfig: TransportConfig = {
          command: config.command,
          args: config.args,
          env: config.env
        };
        
        // Override with npm package configuration if this is an npm package
        if (npmPackageName && config.command) {
          // Check if the current config looks like a local development setup
          const isLocalDev = 
            config.command === 'node' || 
            config.command === 'tsx' || 
            config.command === 'ts-node' ||
            (config.command === 'npm' && config.args?.includes('run')) ||
            (config.command === 'pnpm' && config.args?.includes('run')) ||
            (config.command === 'yarn' && config.args?.includes('run'));
          
          if (isLocalDev) {
            // Override with npm package command
            transportConfig = {
              command: 'npx',
              args: ['-y', npmPackageName],
              env: config.env,
              source: 'npm-package'
            };
          }
        }
        
        // Check for Streamable HTTP configuration
        if (config.transport === 'streamable-http' || config.transport === 'streamable_http' || config.url) {
          transportConfig.transport = 'streamable-http';
          transportConfig.url = config.url;
          transportConfig.headers = config.headers;
          transportConfig.sessionId = config.sessionId;
          
          // Check for OAuth configuration
          if (config.oauth || config.auth?.type === 'oauth') {
            transportConfig.oauth = {
              clientId: config.oauth?.clientId || config.auth?.clientId,
              authorizationUrl: config.oauth?.authorizationUrl || config.auth?.authorizationUrl,
              tokenUrl: config.oauth?.tokenUrl || config.auth?.tokenUrl,
              scopes: config.oauth?.scopes || config.auth?.scopes
            };
          }
        }
        
        transportConfigs[serverName] = transportConfig;
        
        // Extract environment variables from env object
        if (config.env) {
          for (const [name, value] of Object.entries(config.env)) {
            envVariables.push({
              name,
              description: `Environment variable for ${name}`,
              defaultValue: String(value || ''),
              required: true,
              isSecret: name.toLowerCase().includes('key') || 
                       name.toLowerCase().includes('token') ||
                       name.toLowerCase().includes('secret') ||
                       name.toLowerCase().includes('password')
            });
          }
        }
        
        // Also extract environment variables from args
        // Look for patterns like API_KEY="your-api-key" or --api-key <value>
        if (config.args && Array.isArray(config.args)) {
          for (const arg of config.args) {
            // Pattern 1: ENV_VAR="value"
            const envVarMatch = arg.match(/^([A-Z][A-Z0-9_]+)=["']?[^"']*["']?$/);
            if (envVarMatch) {
              const varName = envVarMatch[1];
              if (!envVariables.find(v => v.name === varName)) {
                envVariables.push({
                  name: varName,
                  description: `Environment variable detected from args`,
                  required: true,
                  isSecret: varName.toLowerCase().includes('key') || 
                           varName.toLowerCase().includes('token') ||
                           varName.toLowerCase().includes('secret') ||
                           varName.toLowerCase().includes('password')
                });
              }
            }
            
            // Pattern 2: --api-key or --token flags
            const flagMatch = arg.match(/^--?(api[-_]?key|token|secret|password)/i);
            if (flagMatch) {
              const varName = flagMatch[1].toUpperCase().replace(/-/g, '_');
              const envVarName = varName.includes('API_KEY') ? 'API_KEY' : varName;
              if (!envVariables.find(v => v.name === envVarName)) {
                envVariables.push({
                  name: envVarName,
                  description: `API key or token detected from command line args`,
                  required: true,
                  isSecret: true
                });
              }
            }
          }
        }
      }
    }
    
    // If no MCP config was found but we have an npm package, create a default config
    if (Object.keys(transportConfigs).length === 0 && npmPackageName) {
      transportConfigs[repo] = {
        command: 'npx',
        args: ['-y', npmPackageName],
        source: 'npm-package'
      };
    }

    // If no config found, try to detect from README
    if (envVariables.length === 0) {
      try {
        const readmeUrl = `https://api.github.com/repos/${owner}/${repo}/readme`;
        const readmeResponse = await fetch(readmeUrl, { headers });
        
        if (readmeResponse.ok) {
          const readmeData = await readmeResponse.json();
          const readmeText = Buffer.from(readmeData.content, 'base64').toString('utf-8');
          
          // Look for environment variable patterns
          const envPatterns = [
            /`([A-Z][A-Z0-9_]+)`/g,  // Backtick wrapped
            /\$\{?([A-Z][A-Z0-9_]+)\}?/g,  // Shell variable syntax
            /process\.env\.([A-Z][A-Z0-9_]+)/g,  // Node.js syntax
          ];

          const foundVars = new Set<string>();
          for (const pattern of envPatterns) {
            let match;
            while ((match = pattern.exec(readmeText)) !== null) {
              const varName = match[1];
              if (varName.length > 2 && 
                  varName !== 'NODE' && 
                  varName !== 'PATH' &&
                  varName !== 'HOME' &&
                  varName !== 'USER') {
                foundVars.add(varName);
              }
            }
          }
          
          // Also look for JSON configuration examples in README
          const configBlockPattern = /```json\s*([\s\S]*?)```/g;
          let configMatch;
          while ((configMatch = configBlockPattern.exec(readmeText)) !== null) {
            try {
              const configJson = JSON.parse(configMatch[1]);
              if (configJson.mcpServers) {
                // Extract transport configs and env vars from the example configuration
                for (const [serverName, config] of Object.entries(configJson.mcpServers)) {
                  const serverConfig = config as any;
                  
                  // Store transport configuration if not already found
                  if (!transportConfigs[serverName]) {
                    const transportConfig: TransportConfig = {
                      command: serverConfig.command,
                      args: serverConfig.args,
                      env: serverConfig.env
                    };
                    
                    // Check for Streamable HTTP in README examples
                    if (serverConfig.transport === 'streamable-http' || 
                        serverConfig.transport === 'streamable_http' || 
                        serverConfig.url) {
                      transportConfig.transport = 'streamable-http';
                      transportConfig.url = serverConfig.url;
                      transportConfig.headers = serverConfig.headers;
                      transportConfig.sessionId = serverConfig.sessionId;
                    }
                    
                    transportConfigs[serverName] = transportConfig;
                  }
                  
                  if (serverConfig.env) {
                    for (const [envName] of Object.entries(serverConfig.env)) {
                      if (!foundVars.has(envName)) {
                        foundVars.add(envName);
                      }
                    }
                  }
                  // Also check args for env var patterns
                  if (serverConfig.args && Array.isArray(serverConfig.args)) {
                    for (const arg of serverConfig.args) {
                      const envVarMatch = arg.match(/^([A-Z][A-Z0-9_]+)=["']?[^"']*["']?$/);
                      if (envVarMatch) {
                        foundVars.add(envVarMatch[1]);
                      }
                    }
                  }
                }
              }
            } catch (e) {
              // Not valid JSON, continue
            }
          }

          Array.from(foundVars).forEach(name => {
            envVariables.push({
              name,
              description: `Environment variable detected from README`,
              required: true,
              isSecret: name.toLowerCase().includes('key') || 
                       name.toLowerCase().includes('token') ||
                       name.toLowerCase().includes('secret') ||
                       name.toLowerCase().includes('password') ||
                       name === 'API_KEY'
            });
          });
          
          // Look for Streamable HTTP URLs in README
          const urlPatterns = [
            /https?:\/\/[^\s]+\/mcp/gi,  // URLs ending with /mcp
            /https?:\/\/[^\s]+\/api\/mcp/gi,  // URLs with /api/mcp
            /https?:\/\/api\.[^\s]+\/[^\s]*/gi,  // API subdomain URLs
            /https?:\/\/[^\s]+\.smithery\.ai[^\s]*/gi,  // Smithery URLs
            /https?:\/\/[^\s]+\.context7\.com[^\s]*/gi,  // Context7 URLs
          ];
          
          const foundUrls = new Set<string>();
          for (const pattern of urlPatterns) {
            let match;
            while ((match = pattern.exec(readmeText)) !== null) {
              const url = match[0].replace(/[,;)}\]'"]+$/, ''); // Clean trailing punctuation
              foundUrls.add(url);
            }
          }
          
          // If we found URLs that look like MCP endpoints, add a streamable-http config
          if (foundUrls.size > 0) {
            const url = Array.from(foundUrls)[0]; // Use the first found URL
            transportConfigs['detected-streamable'] = {
              transport: 'streamable-http',
              url: url,
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream'
              }
            };
          }
        }
      } catch (e) {
        console.error('Error fetching README:', e);
      }
    }

    return NextResponse.json({
      success: true,
      envVariables,
      transportConfigs,
      mcpConfig,
      repository: {
        owner,
        name: repo
      }
    });

  } catch (error) {
    console.error('Repository analysis error:', error);
    return createErrorResponse(
      getSafeErrorMessage(error),
      500,
      'ANALYSIS_FAILED'
    );
  }
}