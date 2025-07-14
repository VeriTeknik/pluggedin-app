'use server';

import { TransportType } from '@/lib/mcp/package-detector';

interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string;
  type: string;
}

export interface PackageConfig {
  packageName?: string;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  dockerImage?: string;
  dockerPorts?: string[];
  dockerVolumes?: string[];
  env?: Record<string, string>;
  sessionId?: string;
  oauth?: {
    clientId?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
  };
  confidence: number;
  source: 'registry' | 'package.json' | 'mcp-config' | 'pattern' | 'fallback';
}

export interface DetectionResult {
  [transport: string]: PackageConfig;
}

// Fetch file content from GitHub
async function fetchFileFromGitHub(
  owner: string,
  repo: string,
  path: string
): Promise<string | null> {
  try {
    const githubToken = process.env.GITHUB_TOKEN;
    
    const headers: HeadersInit = {
      'Accept': 'application/vnd.github.v3+json',
    };
    
    if (githubToken) {
      headers['Authorization'] = `Bearer ${githubToken}`;
    }
    
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      { headers }
    );
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    // GitHub returns base64 encoded content
    if (data.content && data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching ${path} from GitHub:`, error);
    return null;
  }
}

// Check if npm package exists
async function checkNpmPackageExists(packageName: string): Promise<boolean> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}`);
    return response.ok;
  } catch {
    return false;
  }
}

// Main detection function
export async function detectPackageConfiguration(
  owner: string,
  repo: string,
  transports: TransportType[]
): Promise<DetectionResult> {
  const result: DetectionResult = {};
  
  // First, try to fetch package.json
  const packageJsonContent = await fetchFileFromGitHub(owner, repo, 'package.json');
  let packageJson: any = null;
  
  if (packageJsonContent) {
    try {
      packageJson = JSON.parse(packageJsonContent);
    } catch (e) {
      console.error('Failed to parse package.json:', e);
    }
  }
  
  for (const transport of transports) {
    const config = await detectForTransport(owner, repo, transport, packageJson);
    if (config) {
      result[transport] = config;
    }
  }
  
  return result;
}

async function detectForTransport(
  owner: string,
  repo: string,
  transport: TransportType,
  packageJson: any
): Promise<PackageConfig | null> {
  // For STDIO transport
  if (transport === 'stdio' && packageJson) {
    // Check mcpServers configuration
    if (packageJson.mcpServers) {
      const serverKey = Object.keys(packageJson.mcpServers)[0];
      const serverConfig = packageJson.mcpServers[serverKey];
      
      return {
        packageName: packageJson.name || `${owner}/${repo}`,
        command: serverConfig.command || 'npx',
        args: serverConfig.args || ['-y', packageJson.name],
        env: serverConfig.env,
        confidence: 0.95,
        source: 'package.json'
      };
    }
    
    // Check if package exists on npm
    if (packageJson.name) {
      const exists = await checkNpmPackageExists(packageJson.name);
      
      if (exists) {
        return {
          packageName: packageJson.name,
          command: 'npx',
          args: ['-y', packageJson.name],
          confidence: 0.9,
          source: 'package.json'
        };
      }
      
      
      // Try without scope
      if (packageJson.name.includes('/')) {
        const nameWithoutScope = packageJson.name.split('/')[1];
        const existsWithoutScope = await checkNpmPackageExists(nameWithoutScope);
        
        if (existsWithoutScope) {
          return {
            packageName: nameWithoutScope,
            command: 'npx',
            args: ['-y', nameWithoutScope],
            confidence: 0.85,
            source: 'package.json'
          };
        }
      }
      
      // Try repo name directly
      const repoNameLower = repo.toLowerCase();
      const repoExists = await checkNpmPackageExists(repoNameLower);
      
      if (repoExists) {
        return {
          packageName: repoNameLower,
          command: 'npx',
          args: ['-y', repoNameLower],
          confidence: 0.8,
          source: 'package.json'
        };
      }
    }
  }
  
  // For docker transport
  if (transport === 'docker') {
    // Check for Dockerfile
    const dockerfileContent = await fetchFileFromGitHub(owner, repo, 'Dockerfile');
    if (dockerfileContent) {
      return {
        dockerImage: `${owner.toLowerCase()}/${repo.toLowerCase()}:latest`,
        command: 'docker',
        args: ['run', '--rm', '-i', `${owner.toLowerCase()}/${repo.toLowerCase()}:latest`],
        confidence: 0.7,
        source: 'pattern'
      };
    }
  }
  
  // For streamable-http
  if (transport === 'streamable-http') {
    // First check if package.json has streamable config
    if (packageJson?.mcpServers) {
      for (const [, config] of Object.entries(packageJson.mcpServers)) {
        const serverConfig = config as any;
        if (serverConfig.transport === 'streamable-http' || 
            serverConfig.transport === 'streamable_http' ||
            serverConfig.url) {
          const config: PackageConfig = {
            url: serverConfig.url,
            headers: serverConfig.headers || {},
            confidence: 0.95,
            source: 'package.json'
          };
          
          // Add OAuth config if present
          if (serverConfig.oauth || serverConfig.auth?.type === 'oauth') {
            config.oauth = {
              clientId: serverConfig.oauth?.clientId || serverConfig.auth?.clientId,
              authorizationUrl: serverConfig.oauth?.authorizationUrl || serverConfig.auth?.authorizationUrl,
              tokenUrl: serverConfig.oauth?.tokenUrl || serverConfig.auth?.tokenUrl,
              scopes: serverConfig.oauth?.scopes || serverConfig.auth?.scopes
            };
          }
          
          // Add session ID if present
          if (serverConfig.sessionId) {
            config.sessionId = serverConfig.sessionId;
          }
          
          return config;
        }
      }
    }
    
    // Check for deployment configs or API endpoints in README
    const readmeContent = await fetchFileFromGitHub(owner, repo, 'README.md');
    if (readmeContent) {
      // Try multiple URL patterns
      const urlPatterns = [
        /https:\/\/[^\s]+\/mcp/gi,
        /https:\/\/[^\s]+\/api\/mcp/gi,
        /https:\/\/api\.[^\s]+\/[^\s]*/gi,
        /https:\/\/[^\s]+\.smithery\.ai[^\s]*/gi,
        /https:\/\/[^\s]+\.context7\.com[^\s]*/gi,
      ];
      
      for (const pattern of urlPatterns) {
        const urlMatch = readmeContent.match(pattern);
        if (urlMatch) {
          const url = urlMatch[0].replace(/[,;)}\]'"]+$/, ''); // Clean trailing punctuation
          return {
            url: url,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json, text/event-stream'
            },
            confidence: 0.7,
            source: 'pattern'
          };
        }
      }
    }
    
    // Check for mcp.json file
    const mcpJsonContent = await fetchFileFromGitHub(owner, repo, 'mcp.json');
    if (mcpJsonContent) {
      try {
        const mcpConfig = JSON.parse(mcpJsonContent);
        if (mcpConfig.transport === 'streamable-http' || mcpConfig.url) {
          const config: PackageConfig = {
            url: mcpConfig.url,
            headers: mcpConfig.headers || {},
            confidence: 0.9,
            source: 'mcp-config'
          };
          
          // Add OAuth config if present
          if (mcpConfig.oauth || mcpConfig.auth?.type === 'oauth') {
            config.oauth = {
              clientId: mcpConfig.oauth?.clientId || mcpConfig.auth?.clientId,
              authorizationUrl: mcpConfig.oauth?.authorizationUrl || mcpConfig.auth?.authorizationUrl,
              tokenUrl: mcpConfig.oauth?.tokenUrl || mcpConfig.auth?.tokenUrl,
              scopes: mcpConfig.oauth?.scopes || mcpConfig.auth?.scopes
            };
          }
          
          // Add session ID if present
          if (mcpConfig.sessionId) {
            config.sessionId = mcpConfig.sessionId;
          }
          
          return config;
        }
      } catch (e) {
        // Invalid JSON
      }
    }
  }
  
  // Fallback patterns
  return generateFallback(owner, repo, transport);
}

function generateFallback(
  owner: string,
  repo: string,
  transport: TransportType
): PackageConfig {
  const lowerOwner = owner.toLowerCase();
  const lowerRepo = repo.toLowerCase();
  
  switch (transport) {
    case 'stdio':
      return {
        packageName: lowerRepo,
        command: 'npx',
        args: ['-y', lowerRepo],
        confidence: 0.5,
        source: 'fallback'
      };
      
    case 'docker':
      return {
        dockerImage: `${lowerOwner}/${lowerRepo}:latest`,
        command: 'docker',
        args: ['run', '--rm', '-i', `${lowerOwner}/${lowerRepo}:latest`],
        confidence: 0.4,
        source: 'fallback'
      };
      
    case 'streamable-http':
      return {
        url: `https://api.${lowerOwner}.com/mcp`,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        confidence: 0.3,
        source: 'fallback'
      };
      
    default:
      return {
        confidence: 0.1,
        source: 'fallback'
      };
  }
}