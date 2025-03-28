'use server';

import fs from 'fs';
import path from 'path';

import { db } from '@/db';
import { systemLogsTable } from '@/db/schema';

import { logAuditEvent } from './audit-logger';
import { ensureLogDirectories, getMcpServerLogDir } from './log-retention';
import { addServerLogForProfile } from './mcp-playground';

// Factory function to create a logger instance
export async function createEnhancedMcpLogger(
  profileUuid: string,
  logLevel: 'error' | 'warn' | 'info' | 'debug',
  mcpServers: Record<string, any>
) {
  // Internal class implementation
  class EnhancedMcpLoggerImpl {
    private serverLogFiles: Map<string, number> = new Map(); // serverId -> file descriptor
    private mcpServerLogDir: string;
    
    constructor(
      private profileUuid: string, 
      private logLevel: 'error' | 'warn' | 'info' | 'debug',
      private mcpServers: Record<string, any>,
      logDir: string
    ) {
      this.mcpServerLogDir = logDir;
      // Initialize log files asynchronously
      this.initializeLogFiles().catch(console.error);
    }
    
    private async initializeLogFiles() {
      try {
        // Ensure log directories exist
        await ensureLogDirectories();
        
        // Create log file for each server
        for (const serverName in this.mcpServers) {
          try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const logFilePath = path.join(
              this.mcpServerLogDir, 
              `${this.profileUuid}_${serverName}_${timestamp}.log`
            );
            
            // Open file for stderr redirection
            const logFd = fs.openSync(logFilePath, 'w');
            
            // Store file descriptor
            this.serverLogFiles.set(serverName, logFd);
            
            // Add stderr log file to MCP server config
            this.mcpServers[serverName].errlog = logFd;
            
            // Log info
            await this.addLog('info', `Created log file for ${serverName}: ${logFilePath}`);
          } catch (error) {
            await this.addLog('error', `Failed to create log file for ${serverName}: ${error}`);
          }
        }
      } catch (error) {
        console.error('Failed to initialize log files:', error);
      }
    }
    
    private async addLog(level: string, message: string, serverName?: string) {
      try {
        // Store log in database
        db.insert(systemLogsTable).values({
          level,
          source: 'MCP_SERVER',
          message,
          details: serverName ? { serverName } : undefined,
          created_at: new Date(),
        }).then().catch(err => console.error('Failed to store log in database:', err));
        
        // Log to console in development
        if (process.env.NODE_ENV === 'development') {
          const colors = {
            debug: '\x1b[36m', // cyan
            info: '\x1b[32m',  // green
            warn: '\x1b[33m',  // yellow
            error: '\x1b[31m', // red
            reset: '\x1b[0m',  // reset
          };
          
          const logMessage = `${colors[level as keyof typeof colors] || ''}[MCP:${level.toUpperCase()}]${colors.reset} ${message}`;
          console.log(logMessage);
          
          // Add to UI visible logs - critical for displaying logs in the UI
          // We send the formatted message to make parsing easier on the client side
          await addServerLogForProfile(this.profileUuid, level, logMessage);
        } else {
          // In production, just add the regular message
          await addServerLogForProfile(this.profileUuid, level, message);
        }
        
        // Record audit log for errors and warnings
        if (level === 'error' || level === 'warn') {
          await logAuditEvent({
            profileUuid: this.profileUuid,
            type: 'MCP_SERVER_LOG',
            action: level === 'error' ? 'SERVER_ERROR' : 'SERVER_WARNING',
            serverName,
            logMessage: message,
            logLevel: level,
          }).catch(err => console.error('Failed to record audit log:', err));
        }
      } catch (error) {
        console.error('Failed to add log:', error);
      }
    }
    
    // Logger interface methods
    async debug(...args: unknown[]) {
      if (this.logLevel === 'debug') {
        await this.addLog('debug', args.map(arg => String(arg)).join(' '));
      }
    }

    async info(...args: unknown[]) {
      if (['info', 'debug'].includes(this.logLevel)) {
        await this.addLog('info', args.map(arg => String(arg)).join(' '));
      }
    }

    async warn(...args: unknown[]) {
      if (['warn', 'info', 'debug'].includes(this.logLevel)) {
        await this.addLog('warn', args.map(arg => String(arg)).join(' '));
      }
    }

    async error(...args: unknown[]) {
      await this.addLog('error', args.map(arg => String(arg)).join(' '));
    }
    
    // Cleanup function - close all open files
    async cleanup() {
      for (const [serverName, fd] of this.serverLogFiles.entries()) {
        try {
          fs.closeSync(fd);
          await this.addLog('info', `Closed log file for ${serverName}`);
        } catch (error) {
          console.error(`Error closing log file: ${serverName}`, error);
        }
      }
      this.serverLogFiles.clear();
    }
    
    // Get log files for this profile
    async getLogFiles() {
      try {
        // Check if directory exists
        if (!fs.existsSync(this.mcpServerLogDir)) {
          return { success: true, files: [] };
        }
        
        // Read all files in directory
        const allFiles = fs.readdirSync(this.mcpServerLogDir);
        
        // Filter for this profile
        const profileLogs = allFiles.filter(file => 
          file.startsWith(`${this.profileUuid}_`)
        );
        
        // Get file details
        const fileDetails = profileLogs.map(fileName => {
          const filePath = path.join(this.mcpServerLogDir, fileName);
          const stats = fs.statSync(filePath);
          
          // Extract server name and timestamp from filename
          const [_, serverName, timestamp] = fileName
            .replace(`${this.profileUuid}_`, '')
            .replace('.log', '')
            .split('_');
          
          return {
            name: fileName,
            serverName,
            timestamp: stats.mtime,
            size: stats.size,
            path: filePath
          };
        });
        
        // Sort files by date (newest first)
        fileDetails.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        
        return { success: true, files: fileDetails };
      } catch (error) {
        console.error('Error getting MCP server log files:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    }
  }

  // Initialize the directories first
  await ensureLogDirectories();
  
  // Get the log directory path
  const mcpServerLogDir = await getMcpServerLogDir();
  
  // Create and return an instance of the logger
  return new EnhancedMcpLoggerImpl(profileUuid, logLevel, mcpServers, mcpServerLogDir);
}