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
 * Performs health checks on SSE servers before initialization
 * Note: Streamable HTTP servers are skipped as they may require special auth handling
 */
async function performServerHealthChecks(
  mcpServersConfig: Record<string, any>,
  profileUuid: string
): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  const checkPromises = Object.entries(mcpServersConfig).map(async ([serverName, config]) => {
    // Only check WebSocket (SSE) servers with a URL
    // Skip health checks for Streamable HTTP servers as they may require special auth handling
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
      // STDIO and STREAMABLE_HTTP servers are assumed to be healthy for initialization purposes
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
    llmProvider?: 'anthropic' | 'openai' | 'google_genai' | 'google_gemini' | 'none';
  }
): Promise<{ tools: any[]; cleanup: McpServerCleanupFn }> { // Return type guarantees non-null on success
  const { logger, timeout, maxRetries, profileUuid, llmProvider } = options;
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
      
      // Debug log for Streamable HTTP servers
      if (serverConfig.type === 'STREAMABLE_HTTP' || serverConfig.transport === 'streamable_http') {
      }

      
      const initPromise = convertMcpToLangchainTools(
        configForTool, // Pass the correctly typed config
        { logger, llmProvider }
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
      const delay = (serverType === 'SSE' || serverType === 'STREAMABLE_HTTP') && lastError.message.includes('connect') ? 2000 : 1000;
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
    skipHealthChecks?: boolean;
    maxRetries?: number;
    llmProvider?: 'anthropic' | 'openai' | 'google_genai' | 'google_gemini' | 'none';
  }
): Promise<ProgressiveInitResult> {
  const {
    logger,
    perServerTimeout = 20000, // 20 seconds per server default
    totalTimeout = 60000, // 60 seconds total default
    skipHealthChecks = false,
    maxRetries = 2, // Default to 2 retries (3 attempts total)
    llmProvider
  } = options;

  const initStatus: ServerInitStatus[] = [];
  const allTools: any[] = [];
  const cleanupFunctions: McpServerCleanupFn[] = [];
  const failedServers: string[] = [];

  // Add cleanup tracking
  let isCleaningUp = false;
  
  // Combined cleanup function with timeout
  const combinedCleanup: McpServerCleanupFn = async () => {
    if (isCleaningUp) return;
    isCleaningUp = true;

    const cleanupPromises = cleanupFunctions.map(cleanup =>
      cleanup().catch(err => console.error('[MCP] Error during individual server cleanup:', err))
    );

    try {
      await Promise.race([
        Promise.allSettled(cleanupPromises),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Combined cleanup timeout')), 15000)
        )
      ]);
    } catch (error) {
      console.error('[MCP] Error during progressive cleanup:', error);
      throw error; // Re-throw to be handled by caller
    }
  };

  // Ensure cleanup runs on process termination
  const cleanup = async () => {
    try {
      await combinedCleanup();
    } catch (error) {
      console.error('[MCP] Error during cleanup:', error);
    }
  };

  // Add process termination handlers
  process.once('beforeExit', cleanup);
  process.once('SIGTERM', cleanup);
  process.once('SIGINT', cleanup);

  try {
    // Perform health checks if not skipped
    let healthResults: Record<string, boolean> = {};
    if (!skipHealthChecks) {
      await addServerLogForProfile(profileUuid, 'info', '[MCP] Performing pre-initialization health checks...');
      healthResults = await performServerHealthChecks(mcpServersConfig, profileUuid);
      await addServerLogForProfile(profileUuid, 'info', '[MCP] Health checks completed.');
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
      return 0;
    });

    // Overall timeout promise
    let overallTimeoutId: NodeJS.Timeout | null = null;
    const overallTimeoutPromise = new Promise<never>((_, reject) => {
      overallTimeoutId = setTimeout(() => {
        reject(new Error(`[MCP] Total initialization timed out after ${totalTimeout / 1000} seconds`));
      }, totalTimeout);
    });

    // Start initialization process with overall timeout
    await Promise.race([
      (async () => {
        for (const serverName of serverNames) {
          const serverConfig = mcpServersConfig[serverName];
          const startTime = Date.now();
          const statusEntry: ServerInitStatus = { serverName, status: 'pending', startTime };
          initStatus.push(statusEntry);

          if (!skipHealthChecks && !healthResults[serverName]) {
            statusEntry.status = 'skipped';
            statusEntry.error = 'Skipped due to failed health check';
            statusEntry.endTime = Date.now();
            await addServerLogForProfile(
              profileUuid,
              'warn',
              `[MCP] Skipping initialization for ${serverName} due to failed health check.`
            );
            continue;
          }

          try {
            const result = await initializeSingleServer(
              serverName,
              serverConfig,
              {
                logger,
                timeout: perServerTimeout,
                maxRetries,
                profileUuid,
                llmProvider
              }
            );

            statusEntry.status = 'success';
            statusEntry.endTime = Date.now();
            allTools.push(...result.tools);
            cleanupFunctions.push(result.cleanup);
            await addServerLogForProfile(
              profileUuid,
              'info',
              `[MCP] Successfully initialized server: ${serverName}`
            );
          } catch (error) {
            statusEntry.status = 'error';
            statusEntry.error = error instanceof Error ? error.message : String(error);
            statusEntry.endTime = Date.now();
            failedServers.push(serverName);
            console.error(`[MCP] Failed to initialize server "${serverName}":`, error);
          }
        }
      })(),
      overallTimeoutPromise
    ]);

    // Clear timeout if we complete successfully
    if (overallTimeoutId) clearTimeout(overallTimeoutId);

    return {
      tools: allTools,
      cleanup: combinedCleanup,
      initStatus,
      failedServers
    };

  } catch (error) {
    console.error('[MCP] Error during progressive initialization:', error);
    throw error;
  } finally {
    // Remove cleanup handlers
    process.removeListener('beforeExit', cleanup);
    process.removeListener('SIGTERM', cleanup);
    process.removeListener('SIGINT', cleanup);
  }
}
