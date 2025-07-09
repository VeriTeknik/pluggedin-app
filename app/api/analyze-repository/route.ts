import { NextRequest, NextResponse } from 'next/server';

interface EnvVariable {
  name: string;
  description?: string;
  required?: boolean;
  isSecret?: boolean;
}

interface TransportConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const repoUrl = searchParams.get('url');

    if (!repoUrl) {
      return NextResponse.json(
        { error: 'Repository URL is required' },
        { status: 400 }
      );
    }

    // Extract owner and repo from URL
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\?]+)/);
    if (!match) {
      return NextResponse.json(
        { error: 'Invalid GitHub URL' },
        { status: 400 }
      );
    }

    const [, owner, repo] = match;
    
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

    if (mcpConfig?.mcpServers) {
      // Extract configuration from all servers
      for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
        const config = serverConfig as any;
        
        // Store transport configuration
        transportConfigs[serverName] = {
          command: config.command,
          args: config.args,
          env: config.env
        };
        
        // Extract environment variables from env object
        if (config.env) {
          for (const [name] of Object.entries(config.env)) {
            envVariables.push({
              name,
              description: `Environment variable for ${name}`,
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
                  if (!transportConfigs[serverName] && (serverConfig.command || serverConfig.args)) {
                    transportConfigs[serverName] = {
                      command: serverConfig.command,
                      args: serverConfig.args,
                      env: serverConfig.env
                    };
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze repository' },
      { status: 500 }
    );
  }
}