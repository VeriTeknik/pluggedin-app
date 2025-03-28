import { McpServerSource } from '@/db/schema';
import { McpIndex, SmitheryServer, SmitheryServerDetail } from '@/types/search';

import { detectCategory } from './categories';

/**
 * Convert a Smithery server to a McpIndex object
 */
export function getMcpServerFromSmitheryServer(server: SmitheryServer): McpIndex {
  // Detect category based on server metadata
  const category = detectCategory(
    server.displayName,
    server.description,
    []
  );
  
  return {
    name: server.displayName,
    description: server.description,
    githubUrl: server.homepage,
    package_name: null,
    command: '',  // Will be populated after fetching details
    args: [],
    envs: [],
    github_stars: null,
    package_registry: null,
    package_download_count: null,
    source: McpServerSource.SMITHERY,
    external_id: server.qualifiedName,
    qualifiedName: server.qualifiedName,
    useCount: server.useCount,
    isDeployed: server.isDeployed,
    updated_at: server.createdAt,
    url: null,  // Add url field with default value
    category
  };
}

/**
 * Update a McpIndex with details from a Smithery server detail
 */
export function updateMcpServerWithDetails(mcpServer: McpIndex, details: SmitheryServerDetail): McpIndex {
  const updated = { ...mcpServer };
  
  // Find the connection config for this server
  const connection = details.connections[0]; // Default to first connection
  
  if (connection) {
    if (connection.type === 'ws') {
      // This is an SSE connection
      updated.command = '';
      updated.url = connection.url || details.deploymentUrl;
    } else if (connection.type === 'stdio') {
      // This is a stdio connection
      updated.command = details.qualifiedName;
      // Extract potential args from schema
      if (connection.configSchema) {
        try {
          // This is a simplified approach and might need adjustment
          // based on the actual structure of configSchema
          const schema = connection.configSchema;
          if (schema.properties) {
            updated.args = Object.keys(schema.properties).map(key => `--${key}`);
            updated.envs = Object.keys(schema.properties)
              .filter(key => schema.properties[key].type === 'string')
              .map(key => `${key.toUpperCase()}=`);
          }
        } catch (error) {
          console.error('Error parsing config schema:', error);
        }
      }
    }
  }
  
  return updated;
}

/**
 * Fetch details for a Smithery server
 */
export async function fetchSmitheryServerDetails(qualifiedName: string): Promise<SmitheryServerDetail> {
  const apiKey = process.env.SMITHERY_API_KEY;
  if (!apiKey) {
    throw new Error('SMITHERY_API_KEY is not defined');
  }

  const url = `https://registry.smithery.ai/servers/${qualifiedName}`;
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Smithery API error: ${response.status} ${response.statusText}`);
  }

  return await response.json() as SmitheryServerDetail;
} 