'use server';

import { and, eq, isNotNull, lt } from 'drizzle-orm';
import fs from 'fs/promises'; // Use fs.promises
import path from 'path';

import { db } from '@/db';
import { auditLogsTable, logRetentionPoliciesTable } from '@/db/schema';

// Define paths as private constants
const LOG_DIR_PATH = process.env.MCP_LOG_DIR || path.join(process.cwd(), 'logs');
const MCP_SERVER_LOG_DIR_PATH = path.join(LOG_DIR_PATH, 'mcp-servers');

// Export functions to get the paths
export async function getLogDir() {
  return LOG_DIR_PATH;
}

export async function getMcpServerLogDir() {
  return MCP_SERVER_LOG_DIR_PATH;
}

// Log dosyalarının saklanacağı dizini oluştur
export async function ensureLogDirectories() {
  try {
    await fs.mkdir(MCP_SERVER_LOG_DIR_PATH, { recursive: true }); // Use fs.promises.mkdir
    return { success: true };
  } catch (error) {
    console.error('Log dizinleri oluşturulamadı:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Log retention politikası güncelle
export async function updateLogRetentionPolicy(
  profileUuid: string, 
  retentionDays: number
  // maxLogSizeMb: number // Removed unused parameter
) {
  try {
    // Validate retentionDays
    if (typeof retentionDays !== 'number' || retentionDays <= 0 || !Number.isInteger(retentionDays)) {
      throw new Error('Invalid retentionDays value. Must be a positive integer.');
    }

    const existingPolicy = await db.query.logRetentionPoliciesTable.findFirst({
      where: eq(logRetentionPoliciesTable.profile_uuid, profileUuid)
    });

    if (existingPolicy) {
      await db.update(logRetentionPoliciesTable)
        .set({
          retention_days: retentionDays,
          // max_log_size_mb: maxLogSizeMb, // Removed unused field
          updated_at: new Date()
        })
        .where(eq(logRetentionPoliciesTable.profile_uuid, profileUuid));
    } else {
      await db.insert(logRetentionPoliciesTable).values({
        profile_uuid: profileUuid,
        retention_days: retentionDays,
        // max_log_size_mb: maxLogSizeMb // Removed unused field
        // is_active and other defaults will be applied by the DB
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Update log retention policy error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Eski logları temizle (CRON job olarak çalıştırılabilir)
export async function cleanupOldLogs() {
  try {
    // Tüm retention politikalarını al
    const policies = await db.query.logRetentionPoliciesTable.findMany({
      where: eq(logRetentionPoliciesTable.is_active, true)
    });

    for (const policy of policies) {
      if (!policy.profile_uuid) continue; // Skip if profile_uuid is null

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retention_days);

      // Bu profil için eski audit logları sil
      await db.delete(auditLogsTable)
        .where(
          and(
            isNotNull(auditLogsTable.profile_uuid),
            eq(auditLogsTable.profile_uuid, policy.profile_uuid),
            lt(auditLogsTable.created_at, cutoffDate)
          )
        );

      // NOTE: System logs are not tied to profile retention policies.
      // Removed deletion of systemLogsTable from this loop.
      // Implement separate cleanup logic for system logs if required.
      // await db.delete(systemLogsTable)
      //   .where(lt(systemLogsTable.created_at, cutoffDate));

      // Eski log dosyalarını temizle
      if (policy.profile_uuid) {
        await cleanupMcpServerLogs(policy.profile_uuid, policy.retention_days);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Cleanup old logs error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// MCP sunucu log dosyalarını temizle (Asynchronous version)
export async function cleanupMcpServerLogs(profileUuid: string, maxAgeDays = 7) {
  let deletedCount = 0;
  try {
    // Check if directory exists using fs.promises.stat
    try {
      await fs.stat(MCP_SERVER_LOG_DIR_PATH);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Directory doesn't exist, nothing to clean
        return { success: true, deletedCount: 0 };
      }
      // Other error accessing directory, re-throw
      throw error;
    }

    const now = new Date();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

    // Read directory contents asynchronously
    const files = await fs.readdir(MCP_SERVER_LOG_DIR_PATH);

    const deletionPromises: Promise<void>[] = [];

    for (const file of files) {
      if (!file.startsWith(`${profileUuid}_`)) {
        continue; // Skip files not matching the profile prefix
      }

      const filePath = path.join(MCP_SERVER_LOG_DIR_PATH, file);

      // Use a closure to capture filePath and file for error reporting
      const deletePromise = (async () => {
        try {
          const stats = await fs.stat(filePath);
          if (now.getTime() - stats.mtime.getTime() > maxAgeMs) {
            await fs.unlink(filePath);
            deletedCount++; // Increment counter on successful deletion
          }
        } catch (error) {
          // Log specific file deletion errors but don't stop the whole process
          console.error(`Failed to process or delete log file ${file}:`, error);
        }
      })();
      deletionPromises.push(deletePromise);
    }

    // Wait for all deletion attempts to complete
    await Promise.all(deletionPromises);

    return {
      success: true,
      deletedCount,
    };
  } catch (error) {
    console.error('Error cleaning up MCP server logs:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
