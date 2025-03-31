'use server';

// Import necessary types from the library - Remove Stdio/SseServerParameters
import { convertMcpToLangchainTools, McpServerCleanupFn, McpServersConfig } from '@h1deya/langchain-mcp-tools';

import { addServerLogForProfile } from './mcp-playground'; // Relative import

// Interface for server initialization status
export interface ServerInitStatus {
  serverName: string;
  status: 'pending' | 'success' | 'error' | 'skipped'; // Added 'skipped' status
  error?: string;
  startTime: number;
  endTime?: number;
}

// Interface for progressive initialization result
export interface ProgressiveInitResult {
  tools: any[];
  cleanup: McpServerCleanupFn;
  initStatus: ServerInitStatus[];
  failedServers: string[];
}

/**
 * Performs health checks on WebSocket (SSE) servers before initialization
 */
async function performServerHealthChecks(
  mcpServersConfig: Record<string, any>,
  profileUuid: string
): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  const checkPromises = Object.entries(mcpServersConfig).map(async ([serverName, config]) => {
    // Only check WebSocket (SSE) servers with a URL
    if (config.type === 'SSE' && config.url) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second timeout for health check

        const response = await fetch(config.url, {
          method: 'HEAD', // Use HEAD for efficiency
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        results[serverName] = response.ok;

        await addServerLogForProfile(
          profileUuid,
          'info',
          `Health check for ${serverName}: ${response.ok ? 'OK' : `Failed (Status: ${response.status})`}`
        );
      } catch (error: any) {
        results[serverName] = false;
        await addServerLogForProfile(
          profileUuid,
          'warn',
          `Health check for ${serverName} failed: ${error.name === 'AbortError' ? 'Timeout' : error.message}`
        );
      }
    } else {
      // STDIO servers are assumed to be healthy for initialization purposes
      results[serverName] = true;
    }
  });

  await Promise.allSettled(checkPromises); // Run checks in parallel
  return results;
}


/**
 * Attempts to initialize a single MCP server with retries
 */
async function initializeSingleServer(
  serverName: string,
  // Revert to Record<string, any> as specific types are not exported
  serverConfig: Record<string, any>,
  options: {
    logger: any;
    timeout: number;
    maxRetries: number;
    profileUuid: string;
  }
): Promise<{ tools: any[]; cleanup: McpServerCleanupFn }> { // Return type guarantees non-null on success
  const { logger, timeout, maxRetries, profileUuid } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) { // <= maxRetries means initial try + retries
    try {
      if (attempt > 0) {
        await addServerLogForProfile(
          profileUuid,
          'info',
          `Retry attempt ${attempt}/${maxRetries} for server "${serverName}"`
        );
      }

      // Construct the config object expected by the library
      // Type assertion needed here because we reverted the specific types
      const configForTool: McpServersConfig = { [serverName]: serverConfig as any };

      const initPromise = convertMcpToLangchainTools(
        configForTool, // Pass the correctly typed config
        { logger }
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Server "${serverName}" initialization timed out after ${timeout / 1000} seconds (Attempt ${attempt + 1})`));
        }, timeout);
      });

      // Race initialization against timeout
      const result = await Promise.race([initPromise, timeoutPromise]);
      return result; // Success

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await addServerLogForProfile(
        profileUuid,
        'warn',
        `Initialization attempt ${attempt + 1} failed for "${serverName}": ${lastError.message}`
      );

      // Don't retry if it's the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Wait before retrying
      // Check serverConfig.type safely
      const serverType = typeof serverConfig === 'object' && serverConfig !== null ? serverConfig.type : undefined;
      const delay = serverType === 'SSE' && lastError.message.includes('connect') ? 2000 : 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // If loop finishes without returning, all attempts failed
  throw lastError || new Error(`Failed to initialize server "${serverName}" after ${maxRetries + 1} attempts`);
}


/**
 * Progressively initializes MCP servers with health checks, retries, timeouts, and status tracking
 */
export async function progressivelyInitializeMcpServers(
  mcpServersConfig: Record<string, any>,
  profileUuid: string,
  options: {
    logger: any;
    perServerTimeout?: number;
    totalTimeout?: number;
    skipHealthChecks?: boolean; // Option to skip health checks
    maxRetries?: number; // Option for max retries per server
  }
): Promise<ProgressiveInitResult> {
  const {
    logger,
    perServerTimeout = 20000, // 20 seconds per server default
    totalTimeout = 60000, // 60 seconds total default
    skipHealthChecks = false,
    maxRetries = 2 // Default to 2 retries (3 attempts total)
  } = options;

  const initStatus: ServerInitStatus[] = [];
  const allTools: any[] = [];
  const cleanupFunctions: McpServerCleanupFn[] = [];
  const failedServers: string[] = [];

  // Perform health checks if not skipped
  let healthResults: Record<string, boolean> = {};
  if (!skipHealthChecks) {
     await addServerLogForProfile(profileUuid, 'info', 'Performing pre-initialization health checks...');
     healthResults = await performServerHealthChecks(mcpServersConfig, profileUuid);
     await addServerLogForProfile(profileUuid, 'info', 'Health checks completed.');
  } else {
     // Assume all healthy if skipped
     Object.keys(mcpServersConfig).forEach(name => healthResults[name] = true);
  }

  // Sort server names: healthy first, then by original order
  const serverNames = Object.keys(mcpServersConfig).sort((a, b) => {
    const healthA = healthResults[a] ?? false;
    const healthB = healthResults[b] ?? false;
    if (healthA && !healthB) return -1;
    if (!healthA && healthB) return 1;
    return 0; // Keep original relative order for servers with same health status
  });

  // Combined cleanup function
  const combinedCleanup: McpServerCleanupFn = async () => {
    const cleanupPromises = cleanupFunctions.map(cleanup =>
      cleanup().catch(err => console.error('Error during individual server cleanup:', err))
    );
    await Promise.allSettled(cleanupPromises);
  };

  // Overall timeout promise
  let overallTimeoutId: NodeJS.Timeout | null = null;
  const overallTimeoutPromise = new Promise<never>((_, reject) => {
    overallTimeoutId = setTimeout(() => {
      reject(new Error(`Total MCP initialization timed out after ${totalTimeout / 1000} seconds. Some servers may have failed or were skipped.`));
    }, totalTimeout);
  });

  try {
    // Start initialization process with overall timeout
    await Promise.race([
      (async () => {
        // Initialize servers one by one based on sorted order
        for (const serverName of serverNames) {
          const serverConfig = mcpServersConfig[serverName];
          const startTime = Date.now();
          const statusEntry: ServerInitStatus = { serverName, status: 'pending', startTime };
          initStatus.push(statusEntry);

          // Skip initialization if health check failed (and not skipped)
          if (!skipHealthChecks && !healthResults[serverName]) {
             statusEntry.status = 'skipped';
             statusEntry.error = 'Skipped due to failed health check';
             statusEntry.endTime = Date.now();
             await addServerLogForProfile(profileUuid, 'warn', `Skipping initialization for ${serverName} due to failed health check.`);
             continue; // Move to the next server
          }

          await addServerLogForProfile(profileUuid, 'info', `Initializing MCP server: ${serverName}`);

          try {
            // Initialize with retries
            const result = await initializeSingleServer(
              serverName,
              serverConfig, // Pass the Record<string, any>
              {
                logger,
                timeout: perServerTimeout,
                maxRetries: maxRetries,
                profileUuid
              }
            );

            // Success
            statusEntry.status = 'success';
            statusEntry.endTime = Date.now();
            allTools.push(...result.tools);
            cleanupFunctions.push(result.cleanup);
            await addServerLogForProfile(profileUuid, 'info', `Successfully initialized MCP server: ${serverName}`);

          } catch (error) {
            // Failure after retries
            statusEntry.status = 'error';
            statusEntry.error = error instanceof Error ? error.message : String(error);
            statusEntry.endTime = Date.now();
            failedServers.push(serverName);
            // Error already logged within initializeSingleServer attempts
            console.error(`Failed to initialize MCP server "${serverName}" after all attempts:`, error);
          }
        }
      })(),
      overallTimeoutPromise
    ]);

    // If we reach here, the process completed within the overall timeout
    if (overallTimeoutId) clearTimeout(overallTimeoutId);

    return {
      tools: allTools,
      cleanup: combinedCleanup,
      initStatus,
      failedServers
    };
  } catch (error) {
    // Overall timeout triggered or another unexpected error occurred
    if (overallTimeoutId) clearTimeout(overallTimeoutId);
    console.error('Error during progressive MCP initialization:', error);

    // Attempt cleanup for any servers that *did* succeed before the timeout/error
    await combinedCleanup().catch(err =>
      console.error('Error during cleanup after initialization failure:', err)
    );

    // Re-throw the error (likely the timeout error)
    throw error;
  }
}
