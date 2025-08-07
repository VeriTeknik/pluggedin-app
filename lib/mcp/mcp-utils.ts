import { McpServerConfig } from '@/lib/mcp/config-types';
import { mapProviderForLangchain } from '@/lib/mcp/llm-utils';

/**
 * Build system prompt for MCP agents
 */
export function buildSystemPrompt(customInstructions?: string, enableRag?: boolean): string {
  let basePrompt = `You are an AI assistant specialized in helping users interact with their development environment through MCP (Model Context Protocol) servers and knowledge bases.

INFORMATION SOURCES:
• Knowledge Context: Documentation, schemas, and background information from RAG
• MCP Tools: Real-time data access and system interactions

DECISION FRAMEWORK:
1. Use knowledge context to understand structure, relationships, and background
2. Use MCP tools for current data, live queries, and actions
3. Combine both sources when helpful - context for understanding, tools for current information
4. Always prioritize accuracy and currency of information

EXAMPLES:
• "How many users?" → Check knowledge for user table structure, use MCP tool to get current count
• "Database schema?" → Use knowledge context if available, otherwise query via MCP tools
• "Update settings" → Use MCP tools for the action, knowledge for validation

Be transparent about which sources you use and why. When you have both context and tools available, use them together for the most complete and accurate response.`;

  // Add RAG-specific instructions if enabled
  if (enableRag) {
    basePrompt += `

RAG INSTRUCTIONS:
• When knowledge context is provided, use it as background information
• Always verify current information using MCP tools when available
• Combine knowledge context with real-time data for comprehensive responses
• Indicate when you're using knowledge context vs. real-time data`;
  }

  // Add custom instructions if provided
  if (customInstructions) {
    basePrompt += `

CUSTOM INSTRUCTIONS:
${customInstructions}`;
  }

  return basePrompt;
}

/**
 * Format server configurations for MCP initialization
 */
export function formatServerConfigs(
  servers: any[], 
  sessionId: string, 
  sessionType: 'playground' | 'embedded'
): Record<string, McpServerConfig> {
  const mcpWorkspacePath = process.env.FIREJAIL_MCP_WORKSPACE ?? '/home/pluggedin/mcp-workspace';
  const configs: Record<string, McpServerConfig> = {};

  servers.forEach(server => {
    const isFilesystemServer = server.command === 'npx' && 
      server.args?.includes('@modelcontextprotocol/server-filesystem');

    if (isFilesystemServer && server.type === 'STDIO') {
      configs[server.name] = {
        name: server.name,
        command: server.command,
        args: [...(server.args?.slice(0, -1) ?? []), '.'],
        env: server.env,
        url: server.url,
        type: server.type,
        uuid: server.uuid,
        config: server.config,
        transport: 'stdio',
        cwd: mcpWorkspacePath,
        applySandboxing: true,
        isolationContext: `${sessionType}_${sessionId}_${Date.now()}`,
      };
    } else {
      configs[server.name] = {
        name: server.name,
        command: server.command,
        args: server.args,
        env: server.env,
        url: server.url,
        type: server.type,
        uuid: server.uuid,
        config: server.config,
      };

      // Add transport field based on server type
      if (server.type === 'STDIO') {
        configs[server.name].transport = 'stdio';
        configs[server.name].applySandboxing = true;
        configs[server.name].isolationContext = `${sessionType}_${sessionId}_${Date.now()}`;
      } else if (server.type === 'SSE') {
        configs[server.name].transport = 'sse';
      } else if (server.type === 'STREAMABLE_HTTP') {
        configs[server.name].transport = 'streamable_http';
        const serverWithOptions = server as any;
        if (serverWithOptions.streamableHTTPOptions) {
          configs[server.name].streamableHTTPOptions = serverWithOptions.streamableHTTPOptions;
        }
      }
    }
  });

  return configs;
}

/**
 * Get session-specific log identifier
 */
export function getSessionLogIdentifier(
  sessionId: string, 
  sessionType: 'playground' | 'embedded'
): string {
  return sessionType === 'embedded' ? `embedded_${sessionId}` : sessionId;
}

/**
 * Create MCP session configuration
 */
export function createMcpSessionConfig(
  sessionId: string,
  profileUuid: string,
  serverUuids: string[],
  llmConfig: any,
  sessionType: 'playground' | 'embedded',
  options: {
    ragEnabled?: boolean;
    customInstructions?: string;
    perServerTimeout?: number;
    totalTimeout?: number;
  } = {}
) {
  return {
    sessionId,
    profileUuid,
    serverUuids,
    llmConfig,
    sessionType,
    ragEnabled: options.ragEnabled || false,
    customInstructions: options.customInstructions,
    perServerTimeout: options.perServerTimeout || 20000,
    totalTimeout: options.totalTimeout || 60000,
    langchainProvider: mapProviderForLangchain(llmConfig.provider)
  };
}

/**
 * Validate MCP server configuration
 */
export function validateServerConfig(server: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!server.name || typeof server.name !== 'string') {
    errors.push('Server name is required and must be a string');
  }

  if (!server.command || typeof server.command !== 'string') {
    errors.push('Server command is required and must be a string');
  }

  if (!server.type || !['STDIO', 'SSE', 'STREAMABLE_HTTP'].includes(server.type)) {
    errors.push('Server type must be one of: STDIO, SSE, STREAMABLE_HTTP');
  }

  if (!server.uuid || typeof server.uuid !== 'string') {
    errors.push('Server UUID is required and must be a string');
  }

  if (server.args && !Array.isArray(server.args)) {
    errors.push('Server args must be an array of strings');
  }

  if (server.env && typeof server.env !== 'object') {
    errors.push('Server env must be an object');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Calculate session timeout based on session type and configuration
 */
export function calculateSessionTimeout(
  sessionType: 'playground' | 'embedded',
  customTimeout?: number
): number {
  // Default timeouts
  const defaultTimeouts = {
    playground: 30 * 60 * 1000, // 30 minutes
    embedded: 60 * 60 * 1000   // 1 hour (embedded chats typically longer sessions)
  };

  return customTimeout || defaultTimeouts[sessionType];
}

/**
 * Generate session ID with proper format
 */
export function generateSessionId(sessionType: 'playground' | 'embedded'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `${sessionType}_${timestamp}_${random}`;
}

/**
 * Extract server UUIDs from server configurations
 */
export function extractServerUuids(servers: any[]): string[] {
  return servers
    .filter(server => server.uuid && typeof server.uuid === 'string')
    .map(server => server.uuid);
}

/**
 * Filter servers by UUIDs
 */
export function filterServersByUuids(servers: any[], uuids: string[]): any[] {
  return servers.filter(server => uuids.includes(server.uuid));
}

/**
 * Get server status summary
 */
export function getServerStatusSummary(servers: any[]): {
  total: number;
  active: number;
  byType: Record<string, number>;
} {
  const summary = {
    total: servers.length,
    active: 0,
    byType: {} as Record<string, number>
  };

  servers.forEach(server => {
    // Count by type
    const type = server.type || 'unknown';
    summary.byType[type] = (summary.byType[type] || 0) + 1;

    // Count active servers
    if (server.status === 'ACTIVE') {
      summary.active++;
    }
  });

  return summary;
}