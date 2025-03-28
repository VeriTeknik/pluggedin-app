'use server';

import { and, eq, isNotNull,lt } from 'drizzle-orm';
import fs from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';

import { db } from '@/db';
import { auditLogsTable, logRetentionPoliciesTable, systemLogsTable } from '@/db/schema';

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
    await mkdir(MCP_SERVER_LOG_DIR_PATH, { recursive: true });
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
  retentionDays: number, 
  maxLogSizeMb: number
) {
  try {
    const existingPolicy = await db.query.logRetentionPoliciesTable.findFirst({
      where: eq(logRetentionPoliciesTable.profile_uuid, profileUuid)
    });
    
    if (existingPolicy) {
      await db.update(logRetentionPoliciesTable)
        .set({
          retention_days: retentionDays,
          max_log_size_mb: maxLogSizeMb,
          updated_at: new Date()
        })
        .where(eq(logRetentionPoliciesTable.profile_uuid, profileUuid));
    } else {
      await db.insert(logRetentionPoliciesTable).values({
        profile_uuid: profileUuid,
        retention_days: retentionDays,
        max_log_size_mb: maxLogSizeMb
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
        
      // Bu profil için eski sistem logları sil
      await db.delete(systemLogsTable)
        .where(lt(systemLogsTable.created_at, cutoffDate));
      
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

// MCP sunucu log dosyalarını temizle
export async function cleanupMcpServerLogs(profileUuid: string, maxAgeDays = 7) {
  try {
    // Log dizinlerinin varlığını kontrol et
    if (!fs.existsSync(MCP_SERVER_LOG_DIR_PATH)) {
      return { success: true, deletedCount: 0 };
    }
    
    const now = new Date();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    
    // Dizindeki tüm dosyaları oku
    const files = fs.readdirSync(MCP_SERVER_LOG_DIR_PATH);
    
    // Bu profile ait ve belirli süre öncesine ait olan logları filtrele
    const oldProfileLogs = files.filter(file => {
      if (!file.startsWith(`${profileUuid}_`)) {
        return false;
      }
      
      const filePath = path.join(MCP_SERVER_LOG_DIR_PATH, file);
      const stats = fs.statSync(filePath);
      return now.getTime() - stats.mtime.getTime() > maxAgeMs;
    });
    
    // Eski dosyaları sil
    let deletedCount = 0;
    for (const file of oldProfileLogs) {
      try {
        const filePath = path.join(MCP_SERVER_LOG_DIR_PATH, file);
        fs.unlinkSync(filePath);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete log file ${file}:`, error);
      }
    }
    
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