import { McpServerSource } from '@/db/schema';
import { McpIndex } from '@/types/search';

import { detectCategory } from './categories';

const PACKAGE_JSON_CACHE_TTL: number = 10 * 60 * 1000; // Cache TTL of 10 minutes

interface PackageJsonCacheEntry {
  data: any;
  timestamp: number;
}

// Cache for package.json data to reduce redundant API calls
const packageJsonCache: Map<string, PackageJsonCacheEntry> = new Map();

const getPackageJsonCache = (key: string): any | undefined => {
  const entry = packageJsonCache.get(key);
  if (entry && (Date.now() - entry.timestamp < PACKAGE_JSON_CACHE_TTL)) {
    return entry.data;
  } else if (entry) {
    packageJsonCache.delete(key); // Evict expired entry
  }
  return undefined;
};

const setPackageJsonCache = (key: string, data: any): void => {
  packageJsonCache.set(key, { data, timestamp: Date.now() });
};

interface GitHubRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string;
  stargazers_count: number;
  updated_at: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  topics: string[];
}

interface GitHubRepoContent {
  name: string;
  path: string;
  content: string; // base64 encoded
  encoding: string;
}

/**
 * Convert GitHub repo to McpIndex format
 */
export function getGitHubRepoAsMcpServer(repo: GitHubRepo, packageJson?: any): McpIndex {
  // Get command name from package.json or repo name
  const command = packageJson?.name || repo.name;
  
  // Get args from package.json or default to help
  const args = ['--help'];
  
  // Extract environment variables
  const envs = extractEnvVarsFromRepo(repo, packageJson);
  
  // Detect category based on repository metadata
  const keywords = packageJson?.keywords || [];
  const category = detectCategory(
    repo.name,
    repo.description,
    [...repo.topics, ...keywords]
  );
  
  return {
    name: packageJson?.name || repo.name,
    description: packageJson?.description || repo.description || '',
    githubUrl: repo.html_url,
    package_name: packageJson?.name || null,
    command,
    args,
    envs,
    github_stars: repo.stargazers_count,
    package_registry: packageJson ? 'npm' : null,
    package_download_count: null,
    source: McpServerSource.GITHUB,
    external_id: repo.full_name,
    tags: repo.topics || [],
    updated_at: repo.updated_at,
    category
  };
}

/**
 * Extract environment variables from a GitHub repo
 */
function extractEnvVarsFromRepo(repo: GitHubRepo, packageJson?: any): string[] {
  const envVars: string[] = [];
  
  // Check topics for common API providers
  if (repo.topics) {
    if (repo.topics.some(t => t.includes('openai'))) {
      envVars.push('OPENAI_API_KEY=');
    }
    if (repo.topics.some(t => t.includes('anthropic'))) {
      envVars.push('ANTHROPIC_API_KEY=');
    }
    if (repo.topics.some(t => t.includes('google'))) {
      envVars.push('GOOGLE_API_KEY=');
    }
  }
  
  // Extract from package.json if available
  if (packageJson) {
    // Check for mcp in keywords or dependencies
    const hasMcp = packageJson.keywords?.some((k: string) => k.includes('mcp')) ||
      Object.keys(packageJson.dependencies || {}).some(d => d.includes('mcp'));
      
    if (hasMcp && !envVars.length) {
      envVars.push('API_KEY=');
    }
  }
  
  return envVars;
}

/**
 * Search for MCP servers on GitHub 
 */
export async function searchGitHubRepos(query: string): Promise<GitHubRepo[]> {
  // Use GitHub search API to find repos matching 'modelcontextprotocol'
  const searchQuery = query 
    ? `${query} modelcontextprotocol in:readme in:description in:topics` 
    : 'modelcontextprotocol in:readme in:description in:topics';
  
  const url = new URL('https://api.github.com/search/repositories');
  url.searchParams.append('q', searchQuery);
  url.searchParams.append('sort', 'stars');
  url.searchParams.append('per_page', '50');
  
  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(process.env.GITHUB_TOKEN && { Authorization: `token ${process.env.GITHUB_TOKEN}` }),
    },
  });
  
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.items as GitHubRepo[];
}

/**
 * Fetch awesome-mcp-servers list and parse it
 */
export async function fetchAwesomeMcpServersList(): Promise<GitHubRepo[]> {
  // Target repo: punkpeye/awesome-mcp-servers
  const url = 'https://api.github.com/repos/punkpeye/awesome-mcp-servers/contents/README.md';
  
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3.raw',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(process.env.GITHUB_TOKEN && { Authorization: `token ${process.env.GITHUB_TOKEN}` }),
    },
  });
  
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  
  const readmeContent = await response.text();
  
  // Parse README for GitHub repos
  // This is a simplified approach - in real implementation we'd want a more robust parser
  const repoRegex = /\[([^\]]+)\]\(([^)]+)\) - (.+)/g;
  const repos: GitHubRepo[] = [];
  let match;
  
  while ((match = repoRegex.exec(readmeContent)) !== null) {
    const name = match[1];
    const url = match[2];
    const description = match[3];
    
    // Only process GitHub URLs
    if (url.includes('github.com')) {
      const fullName = url.replace('https://github.com/', '').replace(/\/$/, '');
      
      repos.push({
        name: name,
        full_name: fullName,
        html_url: url,
        description: description,
        stargazers_count: 0, // Will be updated when fetch repo details
        updated_at: new Date().toISOString(),
        owner: {
          login: fullName.split('/')[0],
          avatar_url: '',
        },
        topics: ['mcp', 'awesome-list'],
      });
    }
  }
  
  return repos;
}

/**
 * Get repository package.json if available
 */
export async function getRepoPackageJson(repo: GitHubRepo): Promise<any | null> {
  // Check if we have a cached version first
  const cachedData = getPackageJsonCache(repo.full_name);
  if (cachedData !== undefined) {
    return cachedData;
  }

  const url = `https://api.github.com/repos/${repo.full_name}/contents/package.json`;
  
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(process.env.GITHUB_TOKEN && { Authorization: `token ${process.env.GITHUB_TOKEN}` }),
      },
    });
    
    if (!response.ok) {
      // Cache null result to avoid repeated failed requests
      setPackageJsonCache(repo.full_name, null);
      return null;
    }
    
    const data = await response.json() as GitHubRepoContent;
    
    if (data.encoding === 'base64') {
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      const packageJson = JSON.parse(content);
      
      // Save the parsed result in the cache
      setPackageJsonCache(repo.full_name, packageJson);
      return packageJson;
    }
    
    // Cache null result for unexpected format
    setPackageJsonCache(repo.full_name, null);
    return null;
  } catch (error) {
    console.error(`Error fetching package.json for ${repo.full_name}:`, error);
    // Don't cache errors - allow retry on transient issues
    return null;
  }
} 