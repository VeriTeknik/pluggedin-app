/**
 * In-memory MCP server logs, keyed by profile.
 *
 * This deliberately does NOT carry the `'use server'` directive. The writer is
 * called from the MCP initializer and the enhanced logger, both server-side,
 * and it was previously exported from a `'use server'` module — which made it
 * a public endpoint that let anyone append lines to any profile's log. The
 * store lives here so the reader and clearer in app/actions/mcp-playground.ts
 * can be gated on profile ownership while still sharing one map with it.
 */

export interface ServerLogEntry {
  level: string;
  message: string;
  timestamp: Date;
}

const serverLogsByProfile: Map<string, ServerLogEntry[]> = new Map();

export async function addServerLog(profileUuid: string, level: string, message: string) {
  const logs = serverLogsByProfile.get(profileUuid) || [];

  // Create the new log entry
  const newLog = { level, message, timestamp: new Date() };

  // Add the log to the array with performance optimizations
  logs.push(newLog);

  // Limit to maximum 2000 logs to prevent memory leaks
  const MAX_LOGS_IN_MEMORY = 2000;
  if (logs.length > MAX_LOGS_IN_MEMORY) {
    // More efficient splice - remove in bigger chunks to reduce array manipulation
    // Remove 20% of the logs when we hit the limit instead of just 1 at a time
    const removeCount = Math.floor(MAX_LOGS_IN_MEMORY * 0.2);
    logs.splice(0, removeCount);
  }

  serverLogsByProfile.set(profileUuid, logs);

  // Handle console logs (MCP:INFO, etc.) and add them to the logs
  if (message.includes('[MCP:')) {
    const match = message.match(/\[MCP:(INFO|ERROR|WARN|DEBUG)\]\s+(.*)/i);
    if (match) {
      const mcpLevel = match[1].toLowerCase();
      const mcpMessage = match[2];

      // Check for duplicates in the last ~20 logs rather than the whole array
      // This is more efficient while still catching most duplicates
      const recentLogs = logs.slice(-20);
      const recentDuplicate = recentLogs.some(existingLog => {
        if (existingLog.level === mcpLevel && existingLog.message === mcpMessage) {
          const timeDiff = Math.abs(new Date().getTime() - existingLog.timestamp.getTime());
          return timeDiff < 100; // Increased window to 100ms to catch more duplicates
        }
        return false;
      });

      // Only add if it's not a duplicate
      if (!recentDuplicate) {
        logs.push({
          level: mcpLevel,
          message: mcpMessage,
          timestamp: new Date()
        });
      }
    }
  }
}

/** The most recent logs for a profile, newest last. */
export function readServerLogs(profileUuid: string): ServerLogEntry[] {
  return serverLogsByProfile.get(profileUuid) || [];
}

export function clearServerLogsFor(profileUuid: string): void {
  serverLogsByProfile.set(profileUuid, []);
  // Also drop any partial streaming logs
  serverLogsByProfile.delete(profileUuid + '_partial');
}

/** The single in-flight streaming message for a profile, if any. */
export function setPartialServerLog(profileUuid: string, entry: ServerLogEntry): void {
  serverLogsByProfile.set(`${profileUuid}_partial`, [entry]);
}

export function clearPartialServerLog(profileUuid: string): void {
  serverLogsByProfile.delete(`${profileUuid}_partial`);
}
