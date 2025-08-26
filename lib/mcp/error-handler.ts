import { NextResponse } from 'next/server';

import { MCPHealthMonitor } from './health-monitor';

/**
 * MCP Error Handler that matches OpenAI MCP error formats
 * Provides comprehensive error handling with proper logging
 */
export class MCPErrorHandler {
  private static instance: MCPErrorHandler;
  private healthMonitor: MCPHealthMonitor;

  private constructor() {
    this.healthMonitor = MCPHealthMonitor.getInstance();
  }

  static getInstance(): MCPErrorHandler {
    if (!MCPErrorHandler.instance) {
      MCPErrorHandler.instance = new MCPErrorHandler();
    }
    return MCPErrorHandler.instance;
  }

  /**
   * Create a standardized MCP error response
   */
  createErrorResponse(
    code: number,
    message: string,
    id: string | null = null,
    data?: any,
    status: number = 200
  ): NextResponse {
    const errorResponse = {
      jsonrpc: '2.0',
      error: {
        code,
        message,
        ...(data && { data })
      },
      id
    };

    // Log the error
    this.logError(code, message, data);

    return NextResponse.json(errorResponse, { status });
  }

  /**
   * Handle standard MCP error codes
   */
  handleMCPError(error: any, requestId: string | null = null): NextResponse {
    // Log the full error for debugging
    console.error('MCP Error:', error);

    // Determine error code and message based on error type
    let code = -32603; // Internal error
    let message = 'Internal server error';
    let status = 500;
    let data: any;

    if (error instanceof Error) {
      data = {
        name: error.name,
        stack: error.stack,
        message: error.message
      };
    }

    // Handle specific error types
    if (this.isParseError(error)) {
      code = -32700; // Parse error
      message = 'Parse error: Invalid JSON';
      status = 400;
    } else if (this.isInvalidRequestError(error)) {
      code = -32600; // Invalid request
      message = 'Invalid request';
      status = 400;
    } else if (this.isMethodNotFoundError(error)) {
      code = -32601; // Method not found
      message = 'Method not found';
      status = 404;
    } else if (this.isInvalidParamsError(error)) {
      code = -32602; // Invalid params
      message = 'Invalid params';
      status = 400;
    } else if (this.isAuthenticationError(error)) {
      code = -32000; // Authentication error
      message = 'Authentication failed';
      status = 401;
    } else if (this.isAuthorizationError(error)) {
      code = -32001; // Authorization error
      message = 'Authorization failed';
      status = 403;
    } else if (this.isResourceNotFoundError(error)) {
      code = -32002; // Resource not found
      message = 'Resource not found';
      status = 404;
    } else if (this.isTimeoutError(error)) {
      code = -32003; // Timeout
      message = 'Request timeout';
      status = 408;
    } else if (this.isRateLimitError(error)) {
      code = -32004; // Rate limit
      message = 'Rate limit exceeded';
      status = 429;
    }

    return this.createErrorResponse(code, message, requestId, data, status);
  }

  /**
   * Handle tool execution errors
   */
  handleToolError(error: any, toolName: string, requestId: string | null = null): NextResponse {
    console.error(`Tool execution error for ${toolName}:`, error);

    let code = -32603; // Internal error
    let message = `Tool execution failed: ${toolName}`;
    let status = 500;
    let data: any = { toolName };

    if (error instanceof Error) {
      data = {
        ...data,
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }

    // Handle specific tool errors
    if (this.isToolNotFoundError(error)) {
      code = -32002; // Tool not found
      message = `Tool not found: ${toolName}`;
      status = 404;
    } else if (this.isToolTimeoutError(error)) {
      code = -32003; // Timeout
      message = `Tool execution timeout: ${toolName}`;
      status = 408;
    } else if (this.isToolPermissionError(error)) {
      code = -32001; // Authorization error
      message = `Tool permission denied: ${toolName}`;
      status = 403;
    } else if (this.isToolValidationError(error)) {
      code = -32602; // Invalid params
      message = `Tool validation error: ${toolName}`;
      status = 400;
    }

    return this.createErrorResponse(code, message, requestId, data, status);
  }

  /**
   * Handle session errors
   */
  handleSessionError(error: any, sessionId: string, requestId: string | null = null): NextResponse {
    console.error(`Session error for ${sessionId}:`, error);

    let code = -32603; // Internal error
    let message = 'Session error';
    let status = 500;
    let data: any = { sessionId };

    if (error instanceof Error) {
      data = {
        ...data,
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }

    // Handle specific session errors
    if (this.isSessionNotFoundError(error)) {
      code = -32002; // Session not found
      message = 'Session not found';
      status = 404;
    } else if (this.isSessionExpiredError(error)) {
      code = -32005; // Session expired
      message = 'Session expired';
      status = 401;
    } else if (this.isSessionTimeoutError(error)) {
      code = -32003; // Timeout
      message = 'Session timeout';
      status = 408;
    }

    return this.createErrorResponse(code, message, requestId, data, status);
  }

  /**
   * Log error with structured format
   */
  private logError(code: number, message: string, data?: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      code,
      message,
      data,
      level: this.getErrorLevel(code)
    };

    // Log to console with appropriate level
    switch (logEntry.level) {
      case 'error':
        console.error('MCP Error:', JSON.stringify(logEntry, null, 2));
        break;
      case 'warn':
        console.warn('MCP Warning:', JSON.stringify(logEntry, null, 2));
        break;
      case 'info':
        console.info('MCP Info:', JSON.stringify(logEntry, null, 2));
        break;
      default:
        console.log('MCP Log:', JSON.stringify(logEntry, null, 2));
    }

    // Record error in health monitor
    this.healthMonitor.recordRequest(0, true); // Record as error
  }

  /**
   * Get error level based on error code
   */
  private getErrorLevel(code: number): 'error' | 'warn' | 'info' {
    // System errors (-32xxx)
    if (code >= -32768 && code <= -32000) {
      return 'error';
    }
    
    // Application errors (-32xxx)
    if (code >= -32099 && code <= -32000) {
      return 'error';
    }
    
    // Implementation-defined errors (-32xxx)
    if (code >= -32099 && code <= -32000) {
      return 'warn';
    }
    
    return 'info';
  }

  // Error type detection methods
  private isParseError(error: any): boolean {
    return error && (
      error.name === 'SyntaxError' ||
      error.message?.includes('JSON') ||
      error.message?.includes('parse') ||
      error.code === 'invalid_json'
    );
  }

  private isInvalidRequestError(error: any): boolean {
    return error && (
      error.name === 'InvalidRequestError' ||
      error.message?.includes('invalid request') ||
      error.code === 'invalid_request'
    );
  }

  private isMethodNotFoundError(error: any): boolean {
    return error && (
      error.name === 'MethodNotFoundError' ||
      error.message?.includes('method not found') ||
      error.message?.includes('not supported') ||
      error.code === 'method_not_found'
    );
  }

  private isInvalidParamsError(error: any): boolean {
    return error && (
      error.name === 'InvalidParamsError' ||
      error.message?.includes('invalid params') ||
      error.message?.includes('validation') ||
      error.code === 'invalid_params'
    );
  }

  private isAuthenticationError(error: any): boolean {
    return error && (
      error.name === 'AuthenticationError' ||
      error.message?.includes('authentication') ||
      error.message?.includes('unauthorized') ||
      error.code === 'authentication_failed' ||
      error.status === 401
    );
  }

  private isAuthorizationError(error: any): boolean {
    return error && (
      error.name === 'AuthorizationError' ||
      error.message?.includes('authorization') ||
      error.message?.includes('forbidden') ||
      error.code === 'authorization_failed' ||
      error.status === 403
    );
  }

  private isResourceNotFoundError(error: any): boolean {
    return error && (
      error.name === 'ResourceNotFoundError' ||
      error.message?.includes('not found') ||
      error.code === 'resource_not_found' ||
      error.status === 404
    );
  }

  private isTimeoutError(error: any): boolean {
    return error && (
      error.name === 'TimeoutError' ||
      error.message?.includes('timeout') ||
      error.code === 'timeout' ||
      error.status === 408
    );
  }

  private isRateLimitError(error: any): boolean {
    return error && (
      error.name === 'RateLimitError' ||
      error.message?.includes('rate limit') ||
      error.message?.includes('too many requests') ||
      error.code === 'rate_limit_exceeded' ||
      error.status === 429
    );
  }

  private isToolNotFoundError(error: any): boolean {
    return error && (
      error.name === 'ToolNotFoundError' ||
      error.message?.includes('tool not found') ||
      error.code === 'tool_not_found'
    );
  }

  private isToolTimeoutError(error: any): boolean {
    return error && (
      error.name === 'ToolTimeoutError' ||
      error.message?.includes('tool timeout') ||
      error.code === 'tool_timeout'
    );
  }

  private isToolPermissionError(error: any): boolean {
    return error && (
      error.name === 'ToolPermissionError' ||
      error.message?.includes('tool permission') ||
      error.message?.includes('tool access denied') ||
      error.code === 'tool_permission_denied'
    );
  }

  private isToolValidationError(error: any): boolean {
    return error && (
      error.name === 'ToolValidationError' ||
      error.message?.includes('tool validation') ||
      error.message?.includes('invalid tool parameters') ||
      error.code === 'tool_validation_error'
    );
  }

  private isSessionNotFoundError(error: any): boolean {
    return error && (
      error.name === 'SessionNotFoundError' ||
      error.message?.includes('session not found') ||
      error.code === 'session_not_found'
    );
  }

  private isSessionExpiredError(error: any): boolean {
    return error && (
      error.name === 'SessionExpiredError' ||
      error.message?.includes('session expired') ||
      error.code === 'session_expired'
    );
  }

  private isSessionTimeoutError(error: any): boolean {
    return error && (
      error.name === 'SessionTimeoutError' ||
      error.message?.includes('session timeout') ||
      error.code === 'session_timeout'
    );
  }
}

/**
 * Standard MCP error codes
 */
export enum MCPErrorCode {
  // Standard JSON-RPC errors
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  
  // MCP-specific errors
  AUTHENTICATION_FAILED = -32000,
  AUTHORIZATION_FAILED = -32001,
  RESOURCE_NOT_FOUND = -32002,
  TIMEOUT = -32003,
  RATE_LIMIT_EXCEEDED = -32004,
  SESSION_EXPIRED = -32005,
  
  // Tool-specific errors
  TOOL_NOT_FOUND = -32100,
  TOOL_TIMEOUT = -32101,
  TOOL_PERMISSION_DENIED = -32102,
  TOOL_VALIDATION_ERROR = -32103,
  
  // Session-specific errors
  SESSION_NOT_FOUND = -32200,
  SESSION_TIMEOUT = -32201,
  SESSION_INVALID = -32202
}

/**
 * Error response interface
 */
export interface ErrorResponse {
  jsonrpc: '2.0';
  error: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | null;
}