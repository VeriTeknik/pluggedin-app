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
      console.log(`GitHub API returned ${response.status} for ${path}`);
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
      console.log('Found package.json with name:', packageJson.name);
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
      console.log(`Checking if ${packageJson.name} exists on npm...`);
      const exists = await checkNpmPackageExists(packageJson.name);
      
      if (exists) {
        console.log(`✓ Found ${packageJson.name} on npm`);
        return {
          packageName: packageJson.name,
          command: 'npx',
          args: ['-y', packageJson.name],
          confidence: 0.9,
          source: 'package.json'
        };
      }
      
      console.log(`✗ ${packageJson.name} not found on npm, trying alternatives...`);
      
      // Try without scope
      if (packageJson.name.includes('/')) {
        const nameWithoutScope = packageJson.name.split('/')[1];
        console.log(`Checking ${nameWithoutScope} (without scope)...`);
        const existsWithoutScope = await checkNpmPackageExists(nameWithoutScope);
        
        if (existsWithoutScope) {
          console.log(`✓ Found ${nameWithoutScope} on npm`);
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
      console.log(`Checking ${repoNameLower} (repo name)...`);
      const repoExists = await checkNpmPackageExists(repoNameLower);
      
      if (repoExists) {
        console.log(`✓ Found ${repoNameLower} on npm`);
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
    // Check for deployment configs or API endpoints
    const readmeContent = await fetchFileFromGitHub(owner, repo, 'README.md');
    if (readmeContent && readmeContent.includes('https://')) {
      // Try to extract API URL from README
      const urlMatch = readmeContent.match(/https:\/\/[^\s]+\/mcp/);
      if (urlMatch) {
        return {
          url: urlMatch[0],
          confidence: 0.6,
          source: 'pattern'
        };
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
        url: `https://api.example.com/mcp/${lowerRepo}`,
        confidence: 0.2,
        source: 'fallback'
      };
      
    default:
      return {
        confidence: 0.1,
        source: 'fallback'
      };
  }
}