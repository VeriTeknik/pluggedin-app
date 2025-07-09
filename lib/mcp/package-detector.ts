import { fetchRegistryServer } from '@/app/actions/registry-servers';

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

export type TransportType = 'stdio' | 'sse' | 'streamable-http' | 'docker';

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
  confidence: number;
  source: 'registry' | 'package.json' | 'mcp-config' | 'pattern' | 'fallback';
}

export interface DetectionResult {
  [transport: string]: PackageConfig;
}

// This class is now mostly deprecated in favor of server-side detection
// Keeping it for backward compatibility and client-side fallbacks
export class MCPPackageDetector {
  private cache = new Map<string, DetectionResult>();

  async detectConfiguration(
    owner: string, 
    repo: string, 
    transports: TransportType[]
  ): Promise<DetectionResult> {
    const cacheKey = `${owner}/${repo}:${transports.join(',')}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const result: DetectionResult = {};

    // Try to detect configuration for each requested transport
    for (const transport of transports) {
      const config = await this.detectForTransport(owner, repo, transport);
      if (config) {
        result[transport] = config;
      }
    }

    this.cache.set(cacheKey, result);
    return result;
  }

  private async detectForTransport(
    owner: string,
    repo: string,
    transport: TransportType
  ): Promise<PackageConfig | null> {
    // Strategy 1: Check registry first
    const registryConfig = await this.detectFromRegistry(owner, repo, transport);
    if (registryConfig && registryConfig.confidence > 0.8) {
      return registryConfig;
    }

    // Strategy 2: Check for MCP standard configuration
    const mcpConfig = await this.detectFromMCPConfig(owner, repo, transport);
    if (mcpConfig && mcpConfig.confidence > 0.7) {
      return mcpConfig;
    }

    // Strategy 3: Parse package.json for npm packages
    if (transport === 'stdio') {
      const packageConfig = await this.detectFromPackageJson(owner, repo);
      if (packageConfig && packageConfig.confidence > 0.6) {
        return packageConfig;
      }
    }

    // Strategy 4: Generate smart fallback based on patterns
    return this.generateSmartFallback(owner, repo, transport);
  }

  private async detectFromRegistry(
    owner: string,
    repo: string,
    transport: TransportType
  ): Promise<PackageConfig | null> {
    try {
      // Try registry ID format: io.github.owner/repo
      const registryId = `io.github.${owner}/${repo}`;
      const registryData = await fetchRegistryServer(registryId);

      if (!registryData.success || !registryData.data?.packages) {
        return null;
      }

      const server = registryData.data;
      
      // Find package for the requested transport
      for (const pkg of server.packages || []) {
        const config: PackageConfig = {
          confidence: 0.9,
          source: 'registry',
        };

        // Map registry package to our transport types
        if (transport === 'stdio' && pkg.registry_name === 'npm') {
          config.command = pkg.runtime_hint || 'npx';
          config.packageName = pkg.name;
          config.args = pkg.package_arguments?.map((arg: any) => arg.value || arg.default) || ['-y', pkg.name];
          
          // Extract environment variables
          if (pkg.environment_variables) {
            config.env = {};
            for (const envVar of pkg.environment_variables) {
              if (envVar.name) {
                config.env[envVar.name] = (envVar as any).default || '';
              }
            }
          }
          
          return config;
        }

        if (transport === 'docker' && pkg.registry_name === 'docker') {
          config.dockerImage = pkg.name;
          config.command = 'docker';
          config.args = ['run'];
          
          // Add runtime arguments
          if (pkg.runtime_arguments) {
            for (const arg of pkg.runtime_arguments) {
              config.args.push(arg.name || '', arg.value || '');
            }
          }
          
          config.args.push(pkg.name);
          return config;
        }

        if (transport === 'streamable-http' && (server as any).remotes) {
          const remote = (server as any).remotes.find((r: any) => r.transport_type === 'streamable');
          if (remote) {
            config.url = remote.url;
            if (remote.headers) {
              config.headers = {};
              for (const header of remote.headers) {
                config.headers[header.name] = header.default || '';
              }
            }
            return config;
          }
        }
      }
    } catch (error) {
      console.error('Error detecting from registry:', error);
    }

    return null;
  }

  private async detectFromPackageJson(
    owner: string,
    repo: string
  ): Promise<PackageConfig | null> {
    try {
      // Fetch package.json from GitHub
      const packageJsonContent = await this.fetchFileFromGitHub(owner, repo, 'package.json');
      if (!packageJsonContent) return null;

      const packageJson = JSON.parse(packageJsonContent);
      
      // Look for mcpServers configuration first (MCP standard)
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
      
      // Check if it has a bin field (executable package)
      if (packageJson.bin) {
        return {
          packageName: packageJson.name,
          command: 'npx',
          args: ['-y', packageJson.name],
          confidence: 0.9,
          source: 'package.json'
        };
      }
      
      // If it has a name field, check if it exists on npm
      if (packageJson.name) {
        const exists = await this.checkNpmPackageExists(packageJson.name);
        if (exists) {
          return {
            packageName: packageJson.name,
            command: 'npx',
            args: ['-y', packageJson.name],
            confidence: 0.85,
            source: 'package.json'
          };
        }
        
        // Check alternative names if the exact name doesn't exist
        const alternativeNames = [
          packageJson.name.replace(/^@[^/]+\//, ''), // Remove scope
          `${owner.toLowerCase()}-${repo.toLowerCase()}`,
          `${repo.toLowerCase()}-mcp`,
          repo.toLowerCase()
        ];
        
        for (const altName of alternativeNames) {
          if (altName !== packageJson.name) {
            const altExists = await this.checkNpmPackageExists(altName);
            if (altExists) {
              return {
                packageName: altName,
                command: 'npx',
                args: ['-y', altName],
                confidence: 0.75,
                source: 'package.json'
              };
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error detecting from package.json:', error);
      return null;
    }
  }

  private async detectFromMCPConfig(
    owner: string,
    repo: string,
    transport: TransportType
  ): Promise<PackageConfig | null> {
    try {
      // Check for mcp.json
      const mcpJsonContent = await this.fetchFileFromGitHub(owner, repo, 'mcp.json');
      if (mcpJsonContent) {
        const mcpConfig = JSON.parse(mcpJsonContent);
        return this.parseMCPConfig(mcpConfig, transport);
      }
      
      // Check for .mcp/config.json
      const mcpConfigContent = await this.fetchFileFromGitHub(owner, repo, '.mcp/config.json');
      if (mcpConfigContent) {
        const mcpConfig = JSON.parse(mcpConfigContent);
        return this.parseMCPConfig(mcpConfig, transport);
      }
      
      // Check examples directory for Claude Desktop config
      const exampleFiles = await this.listFilesInDirectory(owner, repo, 'examples');
      for (const file of exampleFiles) {
        if (file.name.includes('claude') || file.name.includes('config')) {
          const content = await this.fetchFileFromGitHub(owner, repo, `examples/${file.name}`);
          if (content) {
            try {
              const config = JSON.parse(content);
              if (config.mcpServers) {
                const serverKey = Object.keys(config.mcpServers)[0];
                const serverConfig = config.mcpServers[serverKey];
                
                return {
                  command: serverConfig.command || 'npx',
                  args: serverConfig.args,
                  packageName: serverConfig.args?.find((arg: string) => !arg.startsWith('-')),
                  env: serverConfig.env,
                  confidence: 0.8,
                  source: 'mcp-config'
                };
              }
            } catch (_e) {
              // Not JSON, continue
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error detecting from MCP config:', error);
      return null;
    }
  }
  
  private parseMCPConfig(config: any, transport: TransportType): PackageConfig | null {
    if (!config.servers) return null;
    
    for (const server of config.servers) {
      if (transport === 'stdio' && server.command) {
        return {
          command: server.command,
          args: server.args,
          packageName: server.package || server.name,
          env: server.env,
          confidence: 0.85,
          source: 'mcp-config'
        };
      }
      
      if (transport === 'streamable-http' && server.url) {
        return {
          url: server.url,
          headers: server.headers,
          confidence: 0.85,
          source: 'mcp-config'
        };
      }
      
      if (transport === 'docker' && server.docker) {
        return {
          dockerImage: server.docker.image,
          command: 'docker',
          args: ['run', ...(server.docker.args || []), server.docker.image],
          dockerPorts: server.docker.ports,
          dockerVolumes: server.docker.volumes,
          confidence: 0.85,
          source: 'mcp-config'
        };
      }
    }
    
    return null;
  }

  private generateSmartFallback(
    owner: string,
    repo: string,
    transport: TransportType
  ): PackageConfig {
    const lowerOwner = owner.toLowerCase();
    const lowerRepo = repo.toLowerCase();
    
    switch (transport) {
      case 'stdio': {
        // Common npm package name patterns
        const patterns = [
          lowerRepo, // Just repo name (most common)
          `@${lowerOwner}/${lowerRepo}`, // Scoped package
          `${lowerOwner}-${lowerRepo}`, // Hyphenated
          `${lowerRepo}-mcp`, // MCP suffix
          `mcp-${lowerRepo}`, // MCP prefix
          `${lowerRepo}-mcp-server`, // Full suffix
        ];

        // If repo name contains 'mcp', it's likely the package name is just the repo name
        const packageName = lowerRepo.includes('mcp') ? lowerRepo : patterns[1];

        return {
          command: 'npx',
          args: ['-y', packageName],
          packageName,
          confidence: 0.5,
          source: 'fallback',
        };
      }

      case 'docker': {
        // Docker image naming patterns
        const imageName = `${lowerOwner}/${lowerRepo}:latest`;
        
        return {
          command: 'docker',
          args: ['run', '--rm', '-i', imageName],
          dockerImage: imageName,
          confidence: 0.4,
          source: 'fallback',
        };
      }

      case 'streamable-http': {
        // This is harder to guess, return low confidence
        return {
          url: `https://api.example.com/mcp/${lowerRepo}`,
          headers: {
            'Authorization': 'Bearer YOUR_API_KEY',
          },
          confidence: 0.2,
          source: 'fallback',
        };
      }

      case 'sse': {
        // SSE is deprecated, suggest streamable-http instead
        return {
          url: `https://sse.example.com/${lowerRepo}`,
          confidence: 0.1,
          source: 'fallback',
        };
      }

      default:
        return {
          confidence: 0,
          source: 'fallback',
        };
    }
  }

  // Helper method to validate if a package exists on npm
  private async checkNpmPackageExists(packageName: string): Promise<boolean> {
    try {
      const response = await fetch(`https://registry.npmjs.org/${packageName}`);
      return response.ok;
    } catch {
      return false;
    }
  }
  
  // Fetch file content from GitHub
  private async fetchFileFromGitHub(
    owner: string,
    repo: string,
    path: string
  ): Promise<string | null> {
    try {
      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        console.warn('GITHUB_TOKEN not found, falling back to unauthenticated requests');
      }
      
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
  
  // List files in a GitHub directory
  private async listFilesInDirectory(
    owner: string,
    repo: string,
    path: string
  ): Promise<GitHubFile[]> {
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
        return [];
      }
      
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(`Error listing ${path} from GitHub:`, error);
      return [];
    }
  }

  // Get all possible package names for a repo
  public generatePossiblePackageNames(owner: string, repo: string): string[] {
    const lowerOwner = owner.toLowerCase();
    const lowerRepo = repo.toLowerCase();
    
    const patterns = [
      lowerRepo,
      `@${lowerOwner}/${lowerRepo}`,
      `${lowerOwner}-${lowerRepo}`,
      `${lowerRepo}-mcp`,
      `mcp-${lowerRepo}`,
      `${lowerRepo}-mcp-server`,
      `@modelcontextprotocol/${lowerRepo}`,
      `@mcp/${lowerRepo}`,
    ];

    // Remove duplicates
    return [...new Set(patterns)];
  }
}

// Export singleton instance
export const packageDetector = new MCPPackageDetector();