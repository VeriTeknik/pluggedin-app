import { db } from '@/db';
import { eq, and, desc } from 'drizzle-orm';
import { memoryErrorsTable } from '@/db/schema';

export interface MemoryErrorLog {
  id?: string;
  operation: 'extraction' | 'storage' | 'injection' | 'gate' | 'context_builder' | 'artifact_detection' | 'general';
  error_type: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  error_message: string;
  stack_trace?: string;
  conversation_id?: string;
  user_id?: string;
  metadata?: any;
  created_at: Date;
  resolved: boolean;
  resolved_at?: Date;
}

export interface MemoryErrorStats {
  totalErrors: number;
  errorsByOperation: Record<string, number>;
  errorsByType: Record<string, number>;
  recentErrors: MemoryErrorLog[];
  unresolvedErrors: MemoryErrorLog[];
}

/**
 * Enhanced error logger for memory operations with persistent storage
 */
export class MemoryErrorLogger {
  private static instance: MemoryErrorLogger;
  private cache: Map<string, MemoryErrorLog[]> = new Map();
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  public static getInstance(): MemoryErrorLogger {
    if (!MemoryErrorLogger.instance) {
      MemoryErrorLogger.instance = new MemoryErrorLogger();
    }
    return MemoryErrorLogger.instance;
  }

  /**
   * Log a memory operation error with detailed context
   */
  async logError(error: Omit<MemoryErrorLog, 'id' | 'created_at' | 'resolved'>): Promise<string> {
    const errorLog: MemoryErrorLog = {
      ...error,
      created_at: new Date(),
      resolved: false
    };

    // Generate a unique ID for this error
    const errorId = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Store in database
      await db.insert(memoryErrorsTable).values({
        operation: errorLog.operation,
        error_type: errorLog.error_type,
        error_message: errorLog.error_message,
        stack_trace: errorLog.stack_trace,
        conversation_id: errorLog.conversation_id,
        user_id: errorLog.user_id,
        metadata: errorLog.metadata,
        created_at: errorLog.created_at,
        resolved: false
      });

      // Update cache
      this.updateCache(errorLog);

      // Console log for immediate visibility
      const logMethod = this.getConsoleMethod(errorLog.error_type);
      logMethod(`[MEMORY_ERROR:${errorLog.error_type.toUpperCase()}] ${errorLog.operation} - ${errorLog.error_message}`, {
        errorId,
        ...errorLog.metadata,
        conversation_id: errorLog.conversation_id,
        user_id: errorLog.user_id
      });

      return errorId;
    } catch (dbError) {
      // Fallback to console only if database fails
      console.error('[MEMORY_ERROR] Failed to log error to database:', dbError);
      console.error(`[MEMORY_ERROR:${errorLog.error_type.toUpperCase()}] ${errorLog.operation} - ${errorLog.error_message}`, errorLog.metadata);
      
      // Still try to cache it
      this.updateCache(errorLog);
      
      return errorId;
    }
  }

  /**
   * Get error statistics and recent errors
   */
  async getErrorStats(timeRangeMs: number = 24 * 60 * 60 * 1000): Promise<MemoryErrorStats> {
    const since = new Date(Date.now() - timeRangeMs);
    
    try {
      // Get recent errors from database
      const recentDbErrors = await db.query.memoryErrorsTable.findMany({
        where: and(
          eq(memoryErrorsTable.created_at, since)
        ),
        orderBy: [desc(memoryErrorsTable.created_at)],
        limit: 100
      }) as MemoryErrorLog[];

      // Get unresolved errors
      const unresolvedDbErrors = await db.query.memoryErrorsTable.findMany({
        where: eq(memoryErrorsTable.resolved, false),
        orderBy: [desc(memoryErrorsTable.created_at)],
        limit: 100
      }) as MemoryErrorLog[];

      // Combine with cache for real-time errors
      const allRecentErrors = [...recentDbErrors, ...this.getCacheErrors(since)];
      const allUnresolvedErrors = [...unresolvedDbErrors, ...this.getCacheErrors().filter(e => !e.resolved)];

      // Calculate statistics
      const stats: MemoryErrorStats = {
        totalErrors: allRecentErrors.length,
        errorsByOperation: {},
        errorsByType: {},
        recentErrors: allRecentErrors.slice(0, 50), // Limit to 50 most recent
        unresolvedErrors: allUnresolvedErrors.slice(0, 50) // Limit to 50 unresolved
      };

      // Aggregate statistics
      allRecentErrors.forEach(error => {
        stats.errorsByOperation[error.operation] = (stats.errorsByOperation[error.operation] || 0) + 1;
        stats.errorsByType[error.error_type] = (stats.errorsByType[error.error_type] || 0) + 1;
      });

      return stats;
    } catch (dbError) {
      console.error('[MEMORY_ERROR] Failed to get error stats from database, using cache:', dbError);
      
      // Fallback to cache only
      const cacheErrors = this.getCacheErrors(since);
      const stats: MemoryErrorStats = {
        totalErrors: cacheErrors.length,
        errorsByOperation: {},
        errorsByType: {},
        recentErrors: cacheErrors.slice(0, 50),
        unresolvedErrors: cacheErrors.filter(e => !e.resolved).slice(0, 50)
      };

      cacheErrors.forEach(error => {
        stats.errorsByOperation[error.operation] = (stats.errorsByOperation[error.operation] || 0) + 1;
        stats.errorsByType[error.error_type] = (stats.errorsByType[error.error_type] || 0) + 1;
      });

      return stats;
    }
  }

  /**
   * Mark an error as resolved
   */
  async resolveError(errorId: string, resolutionNotes?: string): Promise<boolean> {
    try {
      await db
        .update(memoryErrorsTable)
        .set({
          resolved: true,
          resolved_at: new Date()
        })
        .where(eq(memoryErrorsTable.id, errorId));

      // Update cache
      this.updateCacheResolution(errorId, resolutionNotes);
      
      return true;
    } catch (dbError) {
      console.error('[MEMORY_ERROR] Failed to resolve error in database:', dbError);
      return false;
    }
  }

  /**
   * Get errors for a specific conversation
   */
  async getConversationErrors(conversationId: string): Promise<MemoryErrorLog[]> {
    try {
      const dbErrors = await db.query.memoryErrorsTable.findMany({
        where: eq(memoryErrorsTable.conversation_id, conversationId),
        orderBy: [desc(memoryErrorsTable.created_at)]
      }) as MemoryErrorLog[];

      const cacheErrors = this.getCacheErrors().filter(e => e.conversation_id === conversationId);
      
      // Combine and deduplicate
      const allErrors = [...dbErrors, ...cacheErrors];
      const uniqueErrors = this.deduplicateErrors(allErrors);
      
      return uniqueErrors.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    } catch (dbError) {
      console.error('[MEMORY_ERROR] Failed to get conversation errors from database:', dbError);
      return this.getCacheErrors().filter(e => e.conversation_id === conversationId);
    }
  }

  /**
   * Get errors for a specific user
   */
  async getUserErrors(userId: string): Promise<MemoryErrorLog[]> {
    try {
      const dbErrors = await db.query.memoryErrorsTable.findMany({
        where: eq(memoryErrorsTable.user_id, userId),
        orderBy: [desc(memoryErrorsTable.created_at)]
      }) as MemoryErrorLog[];

      const cacheErrors = this.getCacheErrors().filter(e => e.user_id === userId);
      
      // Combine and deduplicate
      const allErrors = [...dbErrors, ...cacheErrors];
      const uniqueErrors = this.deduplicateErrors(allErrors);
      
      return uniqueErrors.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    } catch (dbError) {
      console.error('[MEMORY_ERROR] Failed to get user errors from database:', dbError);
      return this.getCacheErrors().filter(e => e.user_id === userId);
    }
  }

  /**
   * Clear old errors from database and cache
   */
  async clearOldErrors(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanMs);
    
    try {
      const result = await db
        .delete(memoryErrorsTable)
        .where(eq(memoryErrorsTable.created_at, cutoffDate))
        .returning({ id: memoryErrorsTable.id });

      // Clear cache
      this.clearCache(cutoffDate);
      
      return result.length;
    } catch (dbError) {
      console.error('[MEMORY_ERROR] Failed to clear old errors from database:', dbError);
      this.clearCache(cutoffDate);
      return 0;
    }
  }

  // Private helper methods

  private updateCache(errorLog: MemoryErrorLog): void {
    const key = errorLog.conversation_id || errorLog.user_id || 'global';
    const errors = this.cache.get(key) || [];
    
    errors.push(errorLog);
    
    // Limit cache size
    if (errors.length > this.MAX_CACHE_SIZE) {
      errors.splice(0, errors.length - this.MAX_CACHE_SIZE);
    }
    
    this.cache.set(key, errors);
  }

  private getCacheErrors(since?: Date): MemoryErrorLog[] {
    const allErrors: MemoryErrorLog[] = [];
    
    for (const errors of this.cache.values()) {
      if (since) {
        allErrors.push(...errors.filter(e => e.created_at >= since));
      } else {
        allErrors.push(...errors);
      }
    }
    
    return allErrors;
  }

  private updateCacheResolution(errorId: string, resolutionNotes?: string): void {
    for (const errors of this.cache.values()) {
      const error = errors.find(e => e.id === errorId);
      if (error) {
        error.resolved = true;
        error.resolved_at = new Date();
        break;
      }
    }
  }

  private clearCache(cutoffDate: Date): void {
    for (const [key, errors] of this.cache.entries()) {
      const filteredErrors = errors.filter(e => e.created_at >= cutoffDate);
      if (filteredErrors.length === 0) {
        this.cache.delete(key);
      } else {
        this.cache.set(key, filteredErrors);
      }
    }
  }

  private deduplicateErrors(errors: MemoryErrorLog[]): MemoryErrorLog[] {
    const seen = new Set<string>();
    return errors.filter(error => {
      const key = `${error.operation}:${error.error_type}:${error.error_message}:${error.created_at.getTime()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private getConsoleMethod(severity: string): typeof console.log {
    switch (severity) {
      case 'debug':
        return console.debug;
      case 'info':
        return console.info;
      case 'warn':
        return console.warn;
      case 'error':
      case 'fatal':
        return console.error;
      default:
        return console.log;
    }
  }
}

/**
 * Utility functions for common memory error logging patterns
 */
export const memoryErrorLogger = MemoryErrorLogger.getInstance();

/**
 * Log an extraction error
 */
export async function logExtractionError(
  component: string,
  message: string,
  details?: any,
  conversationId?: string,
  userId?: string,
  embeddedChatUuid?: string
): Promise<string> {
  return memoryErrorLogger.logError({
    operation: 'extraction',
    error_type: 'error',
    error_message: message,
    metadata: {
      component,
      details,
      conversationId,
      userId,
      embeddedChatUuid
    }
  });
}

/**
 * Log a storage error
 */
export async function logStorageError(
  component: string,
  message: string,
  details?: any,
  conversationId?: string,
  userId?: string,
  embeddedChatUuid?: string
): Promise<string> {
  return memoryErrorLogger.logError({
    operation: 'storage',
    error_type: 'error',
    error_message: message,
    metadata: {
      component,
      details,
      conversationId,
      userId,
      embeddedChatUuid
    }
  });
}

/**
 * Log an injection error
 */
export async function logInjectionError(
  component: string,
  message: string,
  details?: any,
  conversationId?: string,
  userId?: string,
  embeddedChatUuid?: string
): Promise<string> {
  return memoryErrorLogger.logError({
    operation: 'injection',
    error_type: 'error',
    error_message: message,
    metadata: {
      component,
      details,
      conversationId,
      userId,
      embeddedChatUuid
    }
  });
}

/**
 * Log a memory gate error
 */
export async function logGateError(
  component: string,
  message: string,
  details?: any,
  conversationId?: string,
  userId?: string,
  embeddedChatUuid?: string
): Promise<string> {
  return memoryErrorLogger.logError({
    operation: 'gate',
    error_type: 'warn',
    error_message: message,
    metadata: {
      component,
      details,
      conversationId,
      userId,
      embeddedChatUuid
    }
  });
}

/**
 * Log a debug message for memory operations
 */
export async function logMemoryDebug(
  component: string,
  message: string,
  details?: any,
  conversationId?: string,
  userId?: string,
  embeddedChatUuid?: string
): Promise<string> {
  return memoryErrorLogger.logError({
    operation: 'general',
    error_type: 'debug',
    error_message: message,
    conversation_id: conversationId,
    user_id: userId,
    metadata: {
      ...(details || {}),
      embeddedChatUuid
    }
  });
}

/**
 * Log an info message for memory operations
 */
export async function logMemoryInfo(
  component: string,
  message: string,
  details?: any,
  conversationId?: string,
  userId?: string,
  embeddedChatUuid?: string
): Promise<string> {
  return memoryErrorLogger.logError({
    operation: 'general',
    error_type: 'info',
    error_message: message,
    conversation_id: conversationId,
    user_id: userId,
    metadata: {
      ...(details || {}),
      embeddedChatUuid
    }
  });
}

/**
 * Wrap an async function with error logging
 */
export async function withMemoryErrorLogging<T>(
  operation: string,
  component: string,
  fn: () => Promise<T>,
  context?: {
    conversationId?: string;
    userId?: string;
    embeddedChatUuid?: string;
  }
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = error instanceof Error ? {
      stack: error.stack,
      name: error.name
    } : error;

    await memoryErrorLogger.logError({
      operation: operation as any,
      error_type: 'error',
      error_message: errorMessage,
      conversation_id: context?.conversationId,
      user_id: context?.userId,
      metadata: {
        ...(errorDetails || {}),
        embeddedChatUuid: context?.embeddedChatUuid
      }
    });

    throw error;
  }
}