'use server';

import { and, eq, isNotNull, lt } from 'drizzle-orm';
import fs from 'fs/promises'; // Use fs.promises
import path from 'path';

import { db } from '@/db';
import { auditLogsTable } from '@/db/schema';
// logRetentionPoliciesTable removed in v3.0 - table was unused

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
// REMOVED in v3.0 - logRetentionPoliciesTable no longer exists
// export async function updateLogRetentionPolicy(
//   profileUuid: string,
//   retentionDays: number
// ) {
//   // Function removed - logRetentionPoliciesTable was unused
//   return { success: false, error: 'Function removed in v3.0' };
// }

// Eski logları temizle (CRON job olarak çalıştırılabilir)
// REMOVED in v3.0 - logRetentionPoliciesTable no longer exists
// export async function cleanupOldLogs() {
//   // Function removed - logRetentionPoliciesTable was unused
//   return { success: false, error: 'Function removed in v3.0' };
// }

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
