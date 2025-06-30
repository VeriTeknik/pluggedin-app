import { McpServerSource } from '@/db/schema';
import { McpIndex, McpServerCategory } from '@/types/search';

interface RegistryPackage {
  registry_name: string;
  name: string;
  version: string;
  runtime_hint?: string;
  package_arguments?: any[];
  runtime_arguments?: any[];
  environment_variables?: Array<{
    name: string;
    description?: string;
  }>;
}

interface PluggedinRegistryServer {
  id: string;
  name: string;
  description: string;
  repository?: {
    url: string;
    source: string;
    id: string;
  };
  version_detail?: {
    version: string;
    release_date: string;
    is_latest: boolean;
  };
  packages?: RegistryPackage[];
}

export function transformPluggedinRegistryToMcpIndex(server: PluggedinRegistryServer): McpIndex {
  const primaryPackage = server.packages?.[0];
  
  return {
    name: server.name,
    description: server.description || '',
    command: extractCommand(primaryPackage),
    args: extractArgs(primaryPackage),
    envs: extractEnvs(primaryPackage),
    url: null, // Will be set based on transport type
    source: McpServerSource.REGISTRY,
    external_id: server.id,
    githubUrl: server.repository?.url || null,
    package_name: primaryPackage?.name || null,
    github_stars: null, // Could fetch from GitHub API later
    package_registry: primaryPackage?.registry_name || null,
    package_download_count: null,
    category: inferCategory(server),
    tags: extractTags(server),
    updated_at: server.version_detail?.release_date,
    qualifiedName: `registry:${server.id}`,
    rating: null, // Will come from your rating system
    ratingCount: null,
    installation_count: null, // Track in your database
  };
}

function extractCommand(pkg?: RegistryPackage): string {
  if (!pkg) return '';
  
  switch (pkg.registry_name) {
    case 'npm':
      return pkg.runtime_hint || 'npx';
    case 'docker':
      return 'docker run';
    case 'pypi':
      return pkg.runtime_hint || 'uvx';
    default:
      return '';
  }
}

function extractArgs(pkg?: RegistryPackage): string[] {
  if (!pkg) return [];
  
  const args: string[] = [];
  
  // Runtime arguments (e.g., docker flags)
  if (pkg.runtime_arguments) {
    args.push(...pkg.runtime_arguments.map((arg: any) => arg.value || arg.default || ''));
  }
  
  // Package name
  if (pkg.name) {
    args.push(pkg.name);
  }
  
  // Package arguments
  if (pkg.package_arguments) {
    args.push(...pkg.package_arguments.map((arg: any) => arg.value || arg.default || ''));
  }
  
  return args.filter(Boolean);
}

function extractEnvs(pkg?: RegistryPackage): string[] {
  if (!pkg?.environment_variables) return [];
  return pkg.environment_variables.map(env => env.name);
}

function inferCategory(server: PluggedinRegistryServer): McpServerCategory {
  const name = server.name.toLowerCase();
  const desc = (server.description || '').toLowerCase();
  
  // Category inference logic
  if (name.includes('llm') || desc.includes('language model')) return McpServerCategory.LLM;
  if (name.includes('search') || desc.includes('search')) return McpServerCategory.SEARCH;
  if (name.includes('code') || desc.includes('code')) return McpServerCategory.CODE;
  if (name.includes('data') || desc.includes('database')) return McpServerCategory.DATA;
  if (name.includes('image') || desc.includes('image')) return McpServerCategory.IMAGE;
  if (name.includes('audio') || desc.includes('audio')) return McpServerCategory.AUDIO;
  if (name.includes('video') || desc.includes('video')) return McpServerCategory.VIDEO;
  
  return McpServerCategory.TOOL;
}

function extractTags(server: PluggedinRegistryServer): string[] {
  const tags: string[] = [];
  
  // Add package types as tags
  server.packages?.forEach(pkg => {
    if (pkg.registry_name) tags.push(pkg.registry_name);
  });
  
  // Add source as tag
  if (server.repository?.source) {
    tags.push(server.repository.source);
  }
  
  // Extract keywords from name (e.g., "io.github.user/project-name" -> ["project", "name"])
  const nameParts = server.name.split('/').pop()?.split('-') || [];
  tags.push(...nameParts.filter(part => part.length > 3));
  
  return [...new Set(tags)]; // Remove duplicates
}

export function inferTransportFromPackages(packages?: RegistryPackage[]): 'stdio' | 'sse' | 'http' {
  if (!packages?.length) return 'stdio';
  
  const pkg = packages[0];
  
  // Docker packages typically use HTTP/SSE
  if (pkg.registry_name === 'docker') {
    return 'sse';
  }
  
  // Check for explicit hints
  if (pkg.runtime_hint?.includes('stdio')) return 'stdio';
  if (pkg.runtime_hint?.includes('sse')) return 'sse';
  if (pkg.runtime_hint?.includes('http')) return 'http';
  
  // Default to stdio for npm/pypi
  return 'stdio';
}