'use server';

import * as fsSync from 'fs'; // Import synchronous fs module
import fs from 'fs/promises'; // Import promises version
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
    // Store both handles (for async close) and descriptors (for sync passing)
    private serverLogHandles: Map<string, fs.FileHandle> = new Map();
    private serverLogDescriptors: Map<string, number> = new Map();
    private mcpServerLogDir: string;
    private isInitialized: Promise<void>; // Promise to track initialization

    constructor(
      private profileUuid: string,
      private logLevel: 'error' | 'warn' | 'info' | 'debug',
      private mcpServers: Record<string, any>,
      logDir: string
    ) {
      this.mcpServerLogDir = logDir;
      // Start initialization but don't block constructor
      this.isInitialized = this.initializeLogFiles();
      this.isInitialized.catch(console.error); // Log initialization errors
    }

    private async initializeLogFiles(): Promise<void> { // Return Promise<void>
      try {
        // Ensure log directories exist
        await ensureLogDirectories(); // Assuming this uses fs.promises

        // Create log file for each server
        const initPromises = Object.keys(this.mcpServers).map(async (serverName) => {
          try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const logFilePath = path.join(
              this.mcpServerLogDir,
              `${this.profileUuid}_${serverName}_${timestamp}.log`
            );

            // Open file synchronously for append/writing to get descriptor immediately
            // Use 'a' mode for appending. Store both handle and descriptor.
            // Note: fsSync.openSync returns a file descriptor (number)
            const logFd = fsSync.openSync(logFilePath, 'a'); // Use fsSync here
            // We still need the handle for async closing later
            const fileHandle = await fs.open(logFilePath, 'a'); // Keep using fs/promises for async open

            // Store handle and descriptor
            this.serverLogHandles.set(serverName, fileHandle);
            this.serverLogDescriptors.set(serverName, logFd);

            // Assign the file descriptor to the 'errlog' property as per the example
            this.mcpServers[serverName].errlog = logFd;

            // Log info - Use internal method but avoid ensureInitialized call during init
            // await this._internalAddLog('info', `Initialized log file for ${serverName}: ${logFilePath} (fd: ${logFd})`);
          } catch (error) {
            // Log error but don't prevent other initializations
            await this._internalAddLog('error', `Failed to initialize log file for ${serverName}: ${error}`);
          }
        });
        await Promise.all(initPromises); // Wait for all initializations

      } catch (error) {
        console.error('Failed to initialize log directory:', error);
        // Rethrow or handle critical initialization failure
        throw error;
      }
    }

    // Ensure initialization is complete before using logger methods
    private async ensureInitialized(): Promise<void> {
        await this.isInitialized;
    }

    // Internal log function used during initialization to avoid deadlock
    private async _internalAddLog(level: string, message: string, serverName?: string) {
       // This version skips ensureInitialized
       try {
        // Store log in database (Consider awaiting if critical)
        db.insert(systemLogsTable).values({
          level,
          source: 'MCP_SERVER',
          message,
          details: serverName ? { serverName } : undefined,
          created_at: new Date(),
        }).then().catch(err => console.error('Failed to store log in database:', err));

        // Log to console
        const colors = { debug: '\x1b[36m', info: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m', reset: '\x1b[0m' };
        const logMessage = `${colors[level as keyof typeof colors] || ''}[MCP:${level.toUpperCase()}]${colors.reset} ${message}`;
        console.log(logMessage);

        // Add to UI visible logs - Also send init logs to UI
        await addServerLogForProfile(this.profileUuid, level, logMessage);

        // Record audit log for errors and warnings (Consider awaiting if critical)
        if (level === 'error' || level === 'warn') {
          logAuditEvent({
            profileUuid: this.profileUuid, type: 'MCP_SERVER_LOG',
            action: level === 'error' ? 'SERVER_ERROR' : 'SERVER_WARNING',
            serverName, logMessage: message, logLevel: level,
          }).catch(err => console.error('Failed to record audit log:', err));
        }
      } catch (error) {
        console.error('Failed to add internal log:', error);
      }
    }


    private async addLog(level: string, message: string, serverName?: string) {
      try {
        // Wait for initialization if it hasn't completed
        await this.ensureInitialized();

        // Store log in database (Consider awaiting if critical)
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

        // Record audit log for errors and warnings (Consider awaiting if critical)
        if (level === 'error' || level === 'warn') {
          logAuditEvent({
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

    // Cleanup function - close all open file handles
    async cleanup() {
        await this.ensureInitialized(); // Ensure init is done before cleanup
        // Close handles using the stored handles map
        const closePromises = Array.from(this.serverLogHandles.entries()).map(async ([serverName, fileHandle]) => {
            try {
                await fileHandle.close(); // Use async close on the handle
                // Use internal log to avoid ensureInitialized deadlock during cleanup
                await this._internalAddLog('info', `Closed log file handle for ${serverName}`);
            } catch (error) {
                console.error(`Error closing log file: ${serverName}`, error);
            }
        });
        await Promise.all(closePromises);
        this.serverLogHandles.clear();
        this.serverLogDescriptors.clear(); // Also clear descriptors map
    }

    // Get log files for this profile (Asynchronous version)
    async getLogFiles(): Promise<{ success: boolean; files?: { name: string; serverName: string; timestamp: Date; size: number; path: string }[]; error?: string }> {
      try {
        await this.ensureInitialized(); // Ensure init is done

        // Check if directory exists using fs.promises.stat
        try {
          await fs.stat(this.mcpServerLogDir);
        } catch (error: any) {
          if (error.code === 'ENOENT') {
            // Directory doesn't exist, return empty list
            return { success: true, files: [] };
          }
          // Other error accessing directory, re-throw
          throw error;
        }

        // Read all files in directory asynchronously
        const allFiles = await fs.readdir(this.mcpServerLogDir);

        // Filter for this profile's log files
        const profileLogFiles = allFiles.filter(file =>
          file.startsWith(`${this.profileUuid}_`) && file.endsWith('.log')
        );

        // Get file details asynchronously
        const fileDetailPromises = profileLogFiles.map(async (fileName) => {
          const filePath = path.join(this.mcpServerLogDir, fileName);
          try {
            const stats = await fs.stat(filePath);

            // Extract server name and timestamp from filename
            // Example: profileUuid_server-name_2024-03-28T12-00-00-000Z.log
            const nameParts = fileName
              .replace(`${this.profileUuid}_`, '')
              .replace('.log', '')
              .split('_');

            // Handle cases where server name might contain underscores
            // const timestampStr = nameParts.pop() || ''; // Removed unused variable
            nameParts.pop(); // Still need to remove the timestamp part
            const serverName = nameParts.join('_'); // Join remaining parts as server name

            return {
              name: fileName,
              serverName: serverName || 'unknown', // Handle potential parsing issues
              timestamp: stats.mtime, // Use modification time
              size: stats.size,
              path: filePath
            };
          } catch (statError) {
            console.error(`Failed to get stats for log file ${fileName}:`, statError);
            return null; // Return null for files that couldn't be stat'd
          }
        });

        // Wait for all promises and filter out nulls
        const fileDetails = (await Promise.all(fileDetailPromises))
                              .filter((details): details is { name: string; serverName: string; timestamp: Date; size: number; path: string } => details !== null);


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

  // Get the log directory path first
  const mcpServerLogDir = await getMcpServerLogDir();
  // Create an instance (initialization starts in constructor)
  const loggerInstance = new EnhancedMcpLoggerImpl(profileUuid, logLevel, mcpServers, mcpServerLogDir);
  // Wait for initialization to complete before returning the instance
  await loggerInstance['isInitialized']; // Access private promise to wait
  return loggerInstance;
}
