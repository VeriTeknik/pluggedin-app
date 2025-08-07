import { McpServerCleanupFn } from '@h1deya/langchain-mcp-tools';

/**
 * Session type discriminator
 */
export type SessionType = 'playground' | 'embedded';

/**
 * LLM configuration interface
 */
export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'xai';
  model: string;
  temperature?: number;
  maxTokens?: number;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  streaming?: boolean;
}

/**
 * Session configuration interface
 */
export interface SessionConfig {
  sessionId: string;
  profileUuid: string;
  serverUuids: string[];
  llmConfig: LLMConfig;
}

/**
 * Session options interface
 */
export interface SessionOptions {
  ragEnabled?: boolean;
  customInstructions?: string;
  perServerTimeout?: number;
  totalTimeout?: number;
  sessionTimeout?: number;
}

/**
 * MCP Session interface
 */
export interface McpSession {
  id: string;
  profileUuid: string;
  agent: any; // ReturnType<typeof createReactAgent>
  cleanup: McpServerCleanupFn;
  lastActive: Date;
  llmConfig: LLMConfig;
  messages: Array<{role: string, content: string, timestamp?: Date, model?: string}>;
  serverUuids: string[];
  ragEnabled?: boolean;
  customInstructions?: string;
  logger: any; // McpLogger interface
}

/**
 * MCP Server configuration interface
 */
export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  type: 'STDIO' | 'SSE' | 'STREAMABLE_HTTP';
  uuid: string;
  config?: any;
  transport?: 'stdio' | 'sse' | 'streamable_http';
  applySandboxing?: boolean;
  isolationContext?: string;
  cwd?: string;
  streamableHTTPOptions?: any;
}

/**
 * Unified MCP configuration for both playground and embedded chat
 */
export interface UnifiedMcpConfig {
  sessionId: string;
  profileUuid: string;
  serverUuids: string[];
  llmConfig: LLMConfig;
  sessionType: SessionType;
  ragEnabled?: boolean;
  customInstructions?: string;
}

/**
 * Session status interface
 */
export interface SessionStatus {
  success: boolean;
  isActive: boolean;
  message?: string;
  llmConfig?: LLMConfig;
  messages?: any[];
  needsRestore?: boolean;
  error?: string;
}

/**
 * Session creation result interface
 */
export interface SessionCreationResult {
  success: boolean;
  message?: string;
  error?: string;
  wasAlreadyActive?: boolean;
  llmConfig?: LLMConfig;
  serverCount?: number;
}

/**
 * Query execution result interface
 */
export interface QueryExecutionResult {
  success: boolean;
  result?: string;
  messages?: any[];
  streamingResponses?: any[];
  error?: string;
  debug?: any;
}

/**
 * Provider mapping for langchain-mcp-tools compatibility
 */
export type LangchainProvider = 'anthropic' | 'openai' | 'google_genai' | 'google_gemini' | 'none';

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}