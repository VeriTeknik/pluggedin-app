import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { authenticateApiKey } from '@/app/api/auth';

import { MCPApprovalSystem } from './approval-system';
import { ToolRegistry } from './tool-registry';

/**
 * Tool Executor for handling MCP tool calls compatible with OpenAI's mcp_call format
 */
export class ToolExecutor {
  private static instance: ToolExecutor;
  private toolRegistry: ToolRegistry;

  private constructor() {
    this.toolRegistry = ToolRegistry.getInstance();
  }

  static getInstance(): ToolExecutor {
    if (!ToolExecutor.instance) {
      ToolExecutor.instance = new ToolExecutor();
    }
    return ToolExecutor.instance;
  }

  /**
   * Execute a tool call with OpenAI's mcp_call format compatibility
   */
  async executeToolCall(
    request: Request,
    toolName: string,
    args: Record<string, any> = {}
  ): Promise<CallToolResult> {
    try {
      // Authenticate the request
      const auth = await authenticateApiKey(request);
      if (auth.error) {
        return {
          content: [
            {
              type: 'text',
              text: 'Authentication failed: Invalid or missing API key',
            },
          ],
          isError: true,
        };
      }

      const profileUuid = auth.activeProfile.uuid;

      // Get tool metadata
      const toolMetadata = await this.toolRegistry.getToolMetadata(profileUuid, toolName);
      if (!toolMetadata) {
        return {
          content: [
            {
              type: 'text',
              text: `Tool '${toolName}' not found or not available for this profile`,
            },
          ],
          isError: true,
        };
      }

      // Check if approval is required
      const approvalSystem = MCPApprovalSystem.getInstance();
      const requiresApproval = approvalSystem.requiresApproval(toolName, args);

      if (requiresApproval) {
        // Request approval
        const approvalResponse = await approvalSystem.requestApproval({
          profileUuid,
          toolName,
          arguments: args,
          description: `Tool call: ${toolName}`,
          riskLevel: this.assessRiskLevel(toolName, args),
          autoApprove: false,
        } as any);

        if (!approvalResponse.approved) {
          return {
            content: [
              {
                type: 'text',
                text: `Tool call requires approval: ${approvalResponse.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      // Execute the tool based on its type
      if (toolName.startsWith('pluggedin_')) {
        return await this.executeStaticTool(toolName, args);
      } else {
        return await this.executeDynamicTool(toolMetadata, args);
      }
    } catch (error) {
      console.error(`Error executing tool ${toolName}:`, error);
      return {
        content: [
          {
            type: 'text',
            text: `Error executing tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Assess the risk level of a tool call
   */
  private assessRiskLevel(toolName: string, args: any): 'low' | 'medium' | 'high' | 'critical' {
    // High-risk tools
    const criticalTools = [
      'filesystem_delete',
      'system_command',
      'database_execute',
      'payment_process',
    ];

    const highRiskTools = [
      'filesystem_write',
      'network_request',
      'email_send',
      'user_create',
      'user_delete',
    ];

    if (criticalTools.some(pattern => toolName.toLowerCase().includes(pattern))) {
      return 'critical';
    }

    if (highRiskTools.some(pattern => toolName.toLowerCase().includes(pattern))) {
      return 'high';
    }

    // Check for sensitive arguments
    if (this.hasSensitiveArguments(args)) {
      return 'high';
    }

    // Default to medium risk for unknown tools
    return 'medium';
  }

  /**
   * Check if arguments contain sensitive information
   */
  private hasSensitiveArguments(args: any): boolean {
    if (!args || typeof args !== 'object') {
      return false;
    }

    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /key/i,
      /credential/i,
      /auth/i,
      /private/i,
      /confidential/i,
    ];

    const checkValue = (value: any): boolean => {
      if (typeof value === 'string') {
        return sensitivePatterns.some(pattern => pattern.test(value));
      }
      if (typeof value === 'object' && value !== null) {
        return Object.values(value).some(checkValue);
      }
      return false;
    };

    return checkValue(args);
  }

  /**
   * Execute static tools (pluggedin_* tools)
   */
  private async executeStaticTool(toolName: string, args: Record<string, any>): Promise<CallToolResult> {
    // Import the server module to handle static tools
    const { createMCPServer } = await import('./server');
    
    try {
      // Create a server instance and handle the static tool
      const server = await createMCPServer();
      
      // For now, return a placeholder for static tools
      // In a full implementation, this would use the server's tool handling logic
      return {
        content: [
          {
            type: 'text',
            text: `Static tool ${toolName} executed with args: ${JSON.stringify(args, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error executing static tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Execute dynamic tools from MCP servers
   */
  private async executeDynamicTool(
    toolMetadata: {
      tool: any;
      serverUuid: string;
      serverName: string;
    },
    args: Record<string, any>
  ): Promise<CallToolResult> {
    try {
      // For now, return a placeholder response for dynamic tools
      // In a full implementation, this would call the actual MCP server
      return {
        content: [
          {
            type: 'text',
            text: `Dynamic tool execution not yet implemented. Tool: ${toolMetadata.tool.name}, Server: ${toolMetadata.serverName}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error executing dynamic tool: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Validate tool arguments against schema
   */
  private validateArguments(args: Record<string, any>, schema: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic validation - in a real implementation, use a proper schema validator like zod
    if (schema.type === 'object' && schema.properties) {
      const requiredProperties = schema.required || [];
      
      // Check required properties
      for (const prop of requiredProperties) {
        if (!(prop in args)) {
          errors.push(`Missing required property: ${prop}`);
        }
      }

      // Check property types
      for (const [prop, value] of Object.entries(args)) {
        const propSchema = schema.properties[prop];
        if (propSchema) {
          if (propSchema.type === 'string' && typeof value !== 'string') {
            errors.push(`Property '${prop}' must be a string`);
          } else if (propSchema.type === 'number' && typeof value !== 'number') {
            errors.push(`Property '${prop}' must be a number`);
          } else if (propSchema.type === 'boolean' && typeof value !== 'boolean') {
            errors.push(`Property '${prop}' must be a boolean`);
          } else if (propSchema.type === 'array' && !Array.isArray(value)) {
            errors.push(`Property '${prop}' must be an array`);
          } else if (propSchema.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
            errors.push(`Property '${prop}' must be an object`);
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get tool execution statistics
   */
  async getExecutionStats(profileUuid: string): Promise<{
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    popularTools: Array<{ name: string; calls: number }>;
  }> {
    // Placeholder for execution statistics
    // In a real implementation, this would query a database of tool executions
    return {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      popularTools: [],
    };
  }

  /**
   * Get tool execution history
   */
  async getExecutionHistory(
    profileUuid: string,
    options: {
      limit?: number;
      offset?: number;
      toolName?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<Array<{
    id: string;
    toolName: string;
    args: Record<string, any>;
    result: CallToolResult;
    timestamp: Date;
    success: boolean;
    duration: number;
  }>> {
    // Placeholder for execution history
    // In a real implementation, this would query a database of tool executions
    return [];
  }

  /**
   * Clear tool execution cache for a profile
   */
  clearCache(profileUuid: string): void {
    // Placeholder for cache clearing
    // In a real implementation, this would clear any cached tool execution results
  }
}