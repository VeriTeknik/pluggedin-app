/**
 * Type definitions for MCP tool execution results
 * Compatible with the MCP SDK and pluggedin-mcp
 */

export interface ToolExecutionResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface ToolExecutionError {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError: true;
}

export interface ToolExecutionSuccess {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: false;
}

export type ToolExecutionResponse = ToolExecutionSuccess | ToolExecutionError;

/**
 * Session management types
 */
export interface MCPSession {
  id: string;
  createdAt: number;
  lastAccessed: number;
  server: any; // MCP Server instance
}

/**
 * Tool registry types
 */
export interface ToolRegistry {
  [toolName: string]: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: any;
      _serverUuid?: string;
      _serverName?: string;
    };
  };
}

/**
 * Streamable HTTP configuration types
 */
export interface StreamableHTTPConfig {
  requireApiAuth?: boolean;
  stateless?: boolean;
  maxSessionAge?: number;
  cors?: {
    origin: string | string[];
    methods: string[];
    allowedHeaders: string[];
  };
}

/**
 * Authentication types
 */
export interface AuthContext {
  profileUuid: string;
  apiKey: string;
  permissions: string[];
}

/**
 * Error types
 */
export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface JSONRPCError {
  jsonrpc: '2.0';
  error: MCPError;
  id: string | number | null;
}

export interface JSONRPCResponse<T = any> {
  jsonrpc: '2.0';
  result?: T;
  error?: MCPError;
  id: string | number | null;
}

/**
 * Request types
 */
export interface JSONRPCRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id: string | number | null;
}

export interface ToolsListRequest {
  jsonrpc: '2.0';
  method: 'tools/list';
  params?: {};
  id: string | number;
}

export interface ToolsCallRequest {
  jsonrpc: '2.0';
  method: 'tools/call';
  params: {
    name: string;
    arguments?: any;
    _meta?: {
      progressToken?: string | number;
    };
  };
  id: string | number;
}

/**
 * Response types
 */
export interface ToolsListResponse {
  tools: Array<{
    name: string;
    description?: string;
    inputSchema: any;
  }>;
}

export interface ToolsCallResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}