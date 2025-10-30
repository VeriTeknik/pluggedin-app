import { McpServerSource } from '@/db/schema';
import { McpIndex, McpServerCategory } from '@/types/search';

interface RegistryPackage {
  registry_name: string;
  name: string;
  version: string;
  transport?: {
    type: string; // stdio, sse, or http
  };
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
  remotes?: Array<{
    transport_type: 'sse' | 'streamable-http' | 'http';
    url: string;
    headers?: Record<string, string>;
  }>;
}

export function transformPluggedinRegistryToMcpIndex(server: PluggedinRegistryServer): McpIndex {
  const primaryPackage = server.packages?.[0];

  // Extract a user-friendly display name from the server name
  // e.g., "io.github.felores/airtable-mcp" -> "Airtable MCP"
  const displayName = extractDisplayName(server.name);

  // Determine transport type and extract URL if remote
  const transportInfo = inferTransportType(server);

  // For remote servers, we don't need command/args, just the URL
  const isRemote = transportInfo.url !== undefined;

  return {
    name: displayName,
    description: server.description || '',
    command: isRemote ? null : extractCommand(primaryPackage),
    args: isRemote ? [] : extractArgs(primaryPackage),
    envs: extractEnvs(primaryPackage),
    url: transportInfo.url || null,
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
    // Store the full server data for later use (including all packages and remotes)
    _rawServer: server as any,
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
      // Use npx as the default for npm packages to maintain compatibility
      return pkg.runtime_hint || 'npx';
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
      // For named arguments, add the name and optionally the value
      const name = arg.name || '';
      const value = arg.value || arg.default || '';

      if (name) {
        result.push(name);
        // Only add value if it exists (some flags are boolean flags without values)
        // Skip adding value if it's explicitly a boolean flag
        if (value && !['true', 'false'].includes(value.toLowerCase())) {
          result.push(value);
        }
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

/**
 * Normalize transport type aliases to standard format
 */
function normalizeTransportType(transportType: string | undefined | null): 'stdio' | 'sse' | 'streamable-http' | 'http' {
  // Handle undefined, null, or empty strings
  if (!transportType) {
    return 'stdio';
  }

  const normalized = transportType.toLowerCase().replace('_', '-');

  if (normalized === 'streamable-http' || normalized === 'streamable') {
    return 'streamable-http';
  } else if (normalized === 'sse') {
    return 'sse';
  } else if (normalized === 'http') {
    return 'http';
  } else {
    return 'stdio';
  }
}

/**
 * Select the highest priority remote from the list
 * Priority: streamable-http > sse > http > first available
 */
function pickRemote(remotes: Array<{ transport_type: string; url: string; headers?: any }>): typeof remotes[0] {
  return remotes.find(r =>
    r.transport_type === 'streamable-http' ||
    r.transport_type === 'streamable_http' ||
    r.transport_type === 'streamable'
  ) || remotes.find(r => r.transport_type === 'sse')
    || remotes.find(r => r.transport_type === 'http')
    || remotes[0];
}

/**
 * Parse headers from array or object format into standardized object
 */
function parseHeaders(headers: Array<{
  name: string;
  description?: string;
  default?: string;
  is_required?: boolean;
  is_secret?: boolean;
}> | Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;

  if (Array.isArray(headers)) {
    const parsed: Record<string, string> = {};
    for (const header of headers) {
      if (header.default) {
        parsed[header.name] = header.default;
      }
    }
    return Object.keys(parsed).length > 0 ? parsed : undefined;
  }

  // Already an object
  const headerObj = headers as Record<string, string>;
  return Object.keys(headerObj).length > 0 ? headerObj : undefined;
}

export function inferTransportType(
  server: {
    packages?: RegistryPackage[];
    remotes?: Array<{
      transport_type: string;
      url: string;
      headers?: Array<{
        name: string;
        description?: string;
        default?: string;
        is_required?: boolean;
        is_secret?: boolean;
      }> | Record<string, string>;
    }>
  }
): {
  transport: 'stdio' | 'sse' | 'streamable-http' | 'http';
  url?: string;
  headers?: Record<string, string>;
} {
  // Priority 1: Check remotes first (remote servers don't need installation)
  if (server.remotes?.length) {
    const remote = pickRemote(server.remotes);
    const transport = normalizeTransportType(remote.transport_type);
    const headers = parseHeaders(remote.headers);

    return {
      transport,
      url: remote.url,
      headers
    };
  }

  // Priority 2: Check packages for stdio servers
  if (server.packages?.length) {
    const pkg = server.packages[0];

    // Docker packages typically use HTTP/SSE
    if (pkg.registry_name === 'docker') {
      return { transport: 'sse' };
    }

    // Check for explicit hints in runtime_hint
    if (pkg.runtime_hint?.includes('sse')) return { transport: 'sse' };
    if (pkg.runtime_hint?.includes('http')) return { transport: 'http' };
    if (pkg.runtime_hint?.includes('stdio')) return { transport: 'stdio' };

    // Default to stdio for npm/pypi/other package managers
    return { transport: 'stdio' };
  }

  // Fallback if no packages or remotes
  return { transport: 'stdio' };
}

// Keep the old function name for backward compatibility but have it use the new one
export function inferTransportFromPackages(packages?: RegistryPackage[]): 'stdio' | 'sse' | 'http' {
  const result = inferTransportType({ packages });
  // Map streamable-http to http for backward compatibility
  if (result.transport === 'streamable-http') return 'http';
  return result.transport as 'stdio' | 'sse' | 'http';
}