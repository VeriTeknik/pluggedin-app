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
  
  // Extract a user-friendly display name from the server name
  // e.g., "io.github.felores/airtable-mcp" -> "Airtable MCP"
  const displayName = extractDisplayName(server.name);
  
  return {
    name: displayName,
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
    qualifiedName: server.name, // Keep original name as qualified name
    rating: undefined, // Will come from your rating system
    ratingCount: undefined,
    installation_count: undefined, // Track in your database
  };
}

function extractDisplayName(serverName: string): string {
  // Extract the last part after the last slash
  // e.g., "io.github.felores/airtable-mcp" -> "airtable-mcp"
  const lastPart = serverName.split('/').pop() || serverName;
  
  // Convert kebab-case or snake_case to Title Case
  // e.g., "airtable-mcp" -> "Airtable MCP"
  // e.g., "filesystem_server" -> "Filesystem Server"
  return lastPart
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map(word => {
      // Handle common acronyms
      const upperCaseWords = ['mcp', 'api', 'ai', 'db', 'sql', 'json', 'xml', 'http', 'url', 'cli'];
      if (upperCaseWords.includes(word.toLowerCase())) {
        return word.toUpperCase();
      }
      // Title case for other words
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function extractCommand(pkg?: RegistryPackage): string {
  if (!pkg) return '';
  
  switch (pkg.registry_name) {
    case 'npm':
      // Use pnpm dlx for better performance and to avoid npm warnings
      return pkg.runtime_hint || 'pnpm';
    case 'docker':
      return 'docker';
    case 'pypi':
      return pkg.runtime_hint || 'uvx';
    case 'unknown':
      // For unknown packages, try to infer from package name
      if (pkg.name?.endsWith('.py')) {
        return 'python';
      } else if (pkg.name?.endsWith('.js')) {
        return 'node';
      }
      return 'node'; // Default to node for unknown
    default:
      return '';
  }
}

// Helper function to extract arguments from schema structure
function extractArgumentsFromSchema(schemaArgs: any[]): string[] {
  const result: string[] = [];
  
  if (!schemaArgs || !Array.isArray(schemaArgs)) return result;
  
  for (const arg of schemaArgs) {
    if (arg.type === 'positional') {
      // For positional arguments, use value or default
      const value = arg.value || arg.default || arg.value_hint || '';
      if (value) result.push(value);
    } else if (arg.type === 'named') {
      // For named arguments, add the name and value separately
      const name = arg.name || '';
      const value = arg.value || arg.default || '';
      
      if (name) {
        result.push(name);
        // Only add value if it exists (some flags don't have values)
        if (value) result.push(value);
      }
    }
  }
  
  return result;
}

function extractArgs(pkg?: RegistryPackage): string[] {
  if (!pkg) return [];
  
  const args: string[] = [];
  
  // Note: runtime_arguments should be handled by the caller
  // as they go between the runtime command and package name
  // This function only handles package arguments that come after the package name
  
  // Handle different registry types
  switch (pkg.registry_name) {
    case 'docker':
      // Docker command starts with 'run'
      args.push('run');
      
      if (pkg.package_arguments) {
        // Extract ALL positional arguments in order (image, paths, etc.)
        const positionalArgs = pkg.package_arguments
          .filter((arg: any) => arg.type === 'positional')
          .map((arg: any) => arg.value || arg.default || '');
        
        // Add all positional arguments
        args.push(...positionalArgs);
        
        // Also handle any named arguments if present
        const namedArgs = pkg.package_arguments
          .filter((arg: any) => arg.type === 'named' && !arg.name?.startsWith('-e'))
          .flatMap((arg: any) => {
            const argName = arg.name || '';
            const argValue = arg.value || arg.default || '';
            // If we have both name and value, return both
            // If only name (like a flag), return just the name
            return argValue ? [argName, argValue] : [argName];
          })
          .filter(Boolean);
        
        args.push(...namedArgs);
      }
      break;
      
    case 'npm':
      // For pnpm, we need to add 'dlx' subcommand
      args.push('dlx');
      
      // First add runtime arguments (e.g., --yes for npx)
      if (pkg.runtime_arguments) {
        const runtimeArgs = extractArgumentsFromSchema(pkg.runtime_arguments);
        args.push(...runtimeArgs);
      }
      
      // Then add package name
      args.push(pkg.name);
      
      // Finally add package arguments (arguments for the npm package itself)
      if (pkg.package_arguments) {
        const packageArgs = extractArgumentsFromSchema(pkg.package_arguments);
        args.push(...packageArgs);
      }
      break;
      
    case 'pypi':
      // First add runtime arguments (e.g., flags for uvx)
      if (pkg.runtime_arguments) {
        const runtimeArgs = extractArgumentsFromSchema(pkg.runtime_arguments);
        args.push(...runtimeArgs);
      }
      
      // Then add package name
      args.push(pkg.name);
      
      // Finally add package arguments (arguments for the Python package itself)
      if (pkg.package_arguments) {
        const packageArgs = extractArgumentsFromSchema(pkg.package_arguments);
        args.push(...packageArgs);
      }
      break;
      
    case 'unknown':
      // For unknown packages with arguments
      if (pkg.package_arguments) {
        // Extract positional arguments (like file paths)
        const positionalArgs = pkg.package_arguments
          .filter((arg: any) => arg.type === 'positional')
          .map((arg: any) => arg.value || arg.default || '');
        args.push(...positionalArgs);
      } else {
        // If no arguments, just add the package name
        args.push(pkg.name);
      }
      break;
      
    default:
      // Default behavior
      if (pkg.name) {
        args.push(pkg.name);
      }
      if (pkg.package_arguments) {
        args.push(...pkg.package_arguments.map((arg: any) => arg.value || arg.default || ''));
      }
  }
  
  return args.filter(Boolean);
}

function extractEnvs(pkg?: RegistryPackage): Array<{ name: string; description?: string }> {
  if (!pkg?.environment_variables) return [];
  return pkg.environment_variables.map(env => ({
    name: env.name,
    description: env.description
  }));
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