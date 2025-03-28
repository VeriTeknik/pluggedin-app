'use server';


import { db } from '@/db';
import { auditLogsTable } from '@/db/schema';

export type AuditLogType = 
  | 'API_CALL'
  | 'AUTH'
  | 'PROFILE'
  | 'MCP_SERVER'
  | 'MCP_REQUEST'
  | 'MCP_SERVER_LOG'
  | 'ADMIN'
  | 'SYSTEM';

export interface AuditLogOptions {
  profileUuid?: string;
  type: AuditLogType;
  action: string;
  requestPath?: string;
  requestMethod?: string;
  requestBody?: any;
  responseStatus?: number;
  responseTimeMs?: number;
  serverUuid?: string;
  serverName?: string;
  logMessage?: string;
  logLevel?: string;
  metadata?: Record<string, any>;
  user_agent?: string;
  ip_address?: string;
}

export async function logAuditEvent(options: AuditLogOptions) {
  try {
    // Build metadata object that includes serverName, logMessage, and logLevel
    const metadata = {
      ...(options.metadata || {}),
      ...(options.serverName ? { serverName: options.serverName } : {}),
      ...(options.logMessage ? { logMessage: options.logMessage } : {}),
      ...(options.logLevel ? { logLevel: options.logLevel } : {})
    };
    
    await db.insert(auditLogsTable).values({
      profile_uuid: options.profileUuid,
      type: options.type,
      action: options.action,
      request_path: options.requestPath,
      request_method: options.requestMethod,
      request_body: options.requestBody,
      response_status: options.responseStatus,
      response_time_ms: options.responseTimeMs,
      server_uuid: options.serverUuid,
      user_agent: options.user_agent,
      ip_address: options.ip_address,
      created_at: new Date(),
      metadata,
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error logging audit event:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
} 