/**
 * Audit logging utility for tracking sensitive operations
 */

import { db } from '@/db';
import { auditLogsTable } from '@/db/schema';
import { headers } from 'next/headers';

export interface AuditLogEntry {
  profileUuid: string;
  type: string;
  action: string;
  serverUuid?: string;
  requestPath?: string;
  requestMethod?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
  userId?: string;
}

/**
 * Log an audit entry for tracking sensitive operations
 * This function is designed to be non-blocking and fail-safe
 */
export async function auditLog(entry: AuditLogEntry): Promise<void> {
  try {
    // Get request headers if available
    let ipAddress = entry.ipAddress;
    let userAgent = entry.userAgent;
    
    if (!ipAddress || !userAgent) {
      try {
        const headersList = await headers();
        ipAddress = ipAddress || 
                   headersList.get('x-forwarded-for')?.split(',')[0] || 
                   headersList.get('x-real-ip') || 
                   'unknown';
        userAgent = userAgent || headersList.get('user-agent') || 'unknown';
      } catch {
        // Headers might not be available in all contexts
      }
    }
    
    // Insert audit log entry
    await db.insert(auditLogsTable).values({
      profile_uuid: entry.profileUuid,
      type: entry.type,
      action: entry.action,
      server_uuid: entry.serverUuid,
      request_path: entry.requestPath,
      request_method: entry.requestMethod,
      ip_address: ipAddress,
      user_agent: userAgent,
      metadata: entry.metadata,
      created_at: new Date(),
    });
  } catch (error) {
    // Audit logging should not break the main operation
    // Log to console for debugging but don't throw
    console.error('Failed to create audit log:', error);
  }
}

/**
 * Common audit log types
 */
export const AuditLogTypes = {
  SERVER_CREATE: 'server_create',
  SERVER_UPDATE: 'server_update',
  SERVER_DELETE: 'server_delete',
  SERVER_READ: 'server_read',
  ENCRYPTION_OPERATION: 'encryption_operation',
  AUTHENTICATION_ATTEMPT: 'authentication_attempt',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  SSRF_ATTEMPT: 'ssrf_attempt',
  DISCOVERY_OPERATION: 'discovery_operation',
} as const;

/**
 * Common audit log actions
 */
export const AuditLogActions = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  READ: 'read',
  ENCRYPT: 'encrypt',
  DECRYPT: 'decrypt',
  LOGIN: 'login',
  LOGOUT: 'logout',
  RATE_LIMITED: 'rate_limited',
  BLOCKED: 'blocked',
  DISCOVER: 'discover',
} as const;

/**
 * Create a formatted audit log message
 */
export function formatAuditMessage(
  action: string,
  resourceType: string,
  resourceId?: string,
  details?: string
): string {
  let message = `${action} ${resourceType}`;
  if (resourceId) {
    message += ` (${resourceId})`;
  }
  if (details) {
    message += `: ${details}`;
  }
  return message;
}