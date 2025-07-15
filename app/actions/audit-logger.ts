'use server';

import { z } from 'zod';

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

const auditLogTypeEnum = z.enum([
  'API_CALL',
  'AUTH',
  'PROFILE',
  'MCP_SERVER',
  'MCP_REQUEST',
  'MCP_SERVER_LOG',
  'ADMIN',
  'SYSTEM'
]);

const auditLogOptionsSchema = z.object({
  profileUuid: z.string().uuid().optional(),
  type: auditLogTypeEnum,
  action: z.string().min(1),
  requestPath: z.string().optional(),
  requestMethod: z.string().optional(),
  requestBody: z.any().optional(),
  responseStatus: z.number().int().optional(),
  responseTimeMs: z.number().int().nonnegative().optional(),
  serverUuid: z.string().uuid().optional(),
  serverName: z.string().optional(),
  logMessage: z.string().optional(),
  logLevel: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  user_agent: z.string().optional(),
  ip_address: z.string().optional(),
});

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
    // Validate input
    const validated = auditLogOptionsSchema.parse(options);
    
    // Build metadata object that includes serverName, logMessage, and logLevel
    const metadata = {
      ...(validated.metadata || {}),
      ...(validated.serverName ? { serverName: validated.serverName } : {}),
      ...(validated.logMessage ? { logMessage: validated.logMessage } : {}),
      ...(validated.logLevel ? { logLevel: validated.logLevel } : {})
    };
    
    await db.insert(auditLogsTable).values({
      profile_uuid: validated.profileUuid,
      type: validated.type,
      action: validated.action,
      request_path: validated.requestPath,
      request_method: validated.requestMethod,
      request_body: validated.requestBody,
      response_status: validated.responseStatus,
      response_time_ms: validated.responseTimeMs,
      server_uuid: validated.serverUuid,
      user_agent: validated.user_agent,
      ip_address: validated.ip_address,
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