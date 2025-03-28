import { McpServerSource } from '@/db/schema';
import { McpIndex, NpmPackage, NpmSearchResponse } from '@/types/search';
import { detectCategory } from './categories';

/**
 * Convert NPM package to McpIndex format
 */
export function getNpmPackageAsMcpServer(npmPackage: NpmPackage): McpIndex {
  // Extract GitHub URL from repository if available
  let githubUrl = null;
  if (npmPackage.repository?.url) {
    // Clean the GitHub URL (remove git+, .git, etc.)
    const url = npmPackage.repository.url
      .replace(/^git\+/, '')
      .replace(/\.git$/, '')
      .replace(/^git:\/\//, 'https://');
      
    githubUrl = url.startsWith('http') ? url : null;
  }

  // Get command name (typically the package name)
  const command = npmPackage.name;
  
  // Generate reasonable arguments based on package name
  const args = ['--help'];
  
  // Extract common environment variables from package name
  // This is a simplification - in reality, we'd want to parse the package 
  // documentation to extract proper environment variables
  const envs = extractPotentialEnvVars(npmPackage);
  
  // Detect category based on metadata
  const category = detectCategory(
    npmPackage.name,
    npmPackage.description,
    npmPackage.keywords || []
  );
  
  return {
    name: npmPackage.name,
    description: npmPackage.description,
    githubUrl,
    package_name: npmPackage.name,
    command: npmPackage.name,
    args,
    envs,
    github_stars: null,
    package_registry: 'npm',
    package_download_count: npmPackage.downloads,
    source: McpServerSource.NPM,
    external_id: npmPackage.name,
    tags: npmPackage.keywords || [],
    updated_at: new Date().toISOString(),
    category
  };
}

/**
 * Extract potential environment variables from an NPM package
 */
function extractPotentialEnvVars(npmPackage: NpmPackage): string[] {
  const envVars: string[] = [];
  
  // Common MCP server environment variables
  if (npmPackage.name.includes('openai') || 
      npmPackage.keywords?.some(k => k.toLowerCase().includes('openai'))) {
    envVars.push('OPENAI_API_KEY=');
  }
  
  if (npmPackage.name.includes('anthropic') || 
      npmPackage.keywords?.some(k => k.toLowerCase().includes('anthropic'))) {
    envVars.push('ANTHROPIC_API_KEY=');
  }
  
  if (npmPackage.name.includes('google') || 
      npmPackage.keywords?.some(k => k.toLowerCase().includes('google'))) {
    envVars.push('GOOGLE_API_KEY=');
  }
  
  // If package has "mcp" in name or keywords, add common MCP environment variables
  if (npmPackage.name.includes('mcp') || 
      npmPackage.keywords?.some(k => k.toLowerCase().includes('mcp'))) {
    if (!envVars.length) {
      envVars.push('API_KEY=');
    }
  }
  
  return envVars;
}

/**
 * Search for MCP packages on NPM
 */
export async function searchNpmPackages(query: string): Promise<NpmSearchResponse> {
  const searchQuery = query 
    ? `${query} modelcontextprotocol` 
    : 'modelcontextprotocol';
  
  const url = new URL('https://registry.npmjs.org/-/v1/search');
  url.searchParams.append('text', searchQuery);
  url.searchParams.append('size', '50');
  
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`NPM API error: ${response.status} ${response.statusText}`);
  }
  
  return await response.json() as NpmSearchResponse;
} 