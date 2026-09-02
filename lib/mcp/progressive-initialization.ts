/**
 * Progressive MCP server initialization.
 *
 * This deliberately does NOT carry the `'use server'` directive and must not
 * move back under app/actions. Every export in such a module is a public POST
 * endpoint, and this one takes an `mcpServersConfig` and hands it to
 * convertMcpToLangchainTools, which spawns `command` with `args` as a child
 * process — arbitrary command execution for anyone who can reach the endpoint.
 *
 * Its caller, executePlaygroundQuery, builds the config server-side from the
 * database, so this was never something a client needed to invoke.
 */

// Import necessary types from the library - Remove Stdio/SseServerParameters
import dns from 'node:dns/promises';

import { convertMcpToLangchainTools, McpServerCleanupFn, McpServersConfig } from '@h1deya/langchain-mcp-tools';

import { addServerLogForProfile } from '@/app/actions/mcp-playground';
import { isPrivateAddress, validateMcpUrl } from '@/lib/security/validators';
import { validateTimeouts } from '@/lib/timeout-validator';

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
 * Initialize a single MCP server with error handling and status tracking
 */
async function initializeOneServer(
  serverName: string,
  serverConfig: any,
  context: {
    logger: any;
    timeout: number;
    maxRetries: number;
    profileUuid: string;
    llmProvider: any;
    skipHealthChecks?: boolean;
    healthResults: Record<string, boolean>;
  }
): Promise<{
  serverName: string;
  status: 'success' | 'error' | 'skipped';
  result?: { tools: any[]; cleanup: McpServerCleanupFn };
  error?: string;
  statusEntry: ServerInitStatus;
}> {
  const startTime = Date.now();
  const statusEntry: ServerInitStatus = {
    serverName,
    status: 'pending',
    startTime
  };

  // Check health status
  if (!context.skipHealthChecks && !context.healthResults[serverName]) {
    statusEntry.status = 'skipped';
    statusEntry.error = 'Skipped due to failed health check';
    statusEntry.endTime = Date.now();
    await addServerLogForProfile(
      context.profileUuid,
      'warn',
      `[MCP] Skipping initialization for ${serverName} due to failed health check.`
    );
    return { serverName, status: 'skipped', statusEntry };
  }

  try {
    const result = await initializeSingleServer(
      serverName,
      serverConfig,
      {
        logger: context.logger,
        timeout: context.timeout,
        maxRetries: context.maxRetries,
        profileUuid: context.profileUuid,
        llmProvider: context.llmProvider
      }
    );

    statusEntry.status = 'success';
    statusEntry.endTime = Date.now();
    await addServerLogForProfile(
      context.profileUuid,
      'info',
      `[MCP] Successfully initialized server: ${serverName}`
    );
    return { serverName, status: 'success', result, statusEntry };
  } catch (error) {
    statusEntry.status = 'error';
    statusEntry.error = error instanceof Error ? error.message : String(error);
    statusEntry.endTime = Date.now();
    console.error(`[MCP] Failed to initialize server "${serverName}":`, error);
    return { serverName, status: 'error', error: statusEntry.error, statusEntry };
  }
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
      // The url reaches fetch, and fetch follows redirects. Without this the
      // health check is a probe of whatever the server can reach — cloud
      // metadata, internal admin panels, neighbouring containers — with the
      // answer handed back through the server log.
      const urlCheck = validateMcpUrl(config.url);
      if (!urlCheck.valid) {
        results[serverName] = false;
        await addServerLogForProfile(
          profileUuid,
          'warn',
          `Health check for ${serverName} skipped: ${urlCheck.error}`
        );
        return;
      }

      // The hostname passing is not enough: a name the caller controls can be
      // pointed straight at loopback or RFC 1918 space, so check what DNS
      // actually returns. This is still resolve-then-connect, so it does not
      // close a rebind between the two, but it removes the trivial case.
      try {
        const addresses = await dns.lookup(urlCheck.parsedUrl!.hostname, { all: true });
        if (addresses.some((entry) => isPrivateAddress(entry.address))) {
          results[serverName] = false;
          await addServerLogForProfile(
            profileUuid,
            'warn',
            `Health check for ${serverName} skipped: host resolves to a private address`
          );
          return;
        }
      } catch (_error) {
        results[serverName] = false;
        await addServerLogForProfile(
          profileUuid,
          'warn',
          `Health check for ${serverName} skipped: host could not be resolved`
        );
        return;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second timeout for health check

        const response = await fetch(config.url, {
          method: 'HEAD', // Use HEAD for efficiency
          signal: controller.signal,
          // A public url can redirect into the private network, and fetch
          // follows redirects by default. The check only needs the first hop.
          redirect: 'manual',
        });

        clearTimeout(timeoutId);

        // We do not follow the redirect, but a 3xx still answers the only
        // question this check asks: is the endpoint alive? Treating it as a
        // failure would skip every server that legitimately redirects.
        const reachable = response.ok || (response.status >= 300 && response.status < 400);
        results[serverName] = reachable;

        await addServerLogForProfile(
          profileUuid,
          'info',
          `Health check for ${serverName}: ${reachable ? 'OK' : `Failed (Status: ${response.status})`}`
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

      // CodeQL: timeout value is validated in progressivelyInitializeMcpServers using validateTimeouts()
      // which caps the value to prevent resource exhaustion attacks
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
    perServerTimeout: userPerServerTimeout,
    totalTimeout: userTotalTimeout,
    skipHealthChecks = false,
    maxRetries = 2, // Default to 2 retries (3 attempts total)
    llmProvider
  } = options;
  
  // Validate and cap timeout values to prevent DoS attacks
  const { perServerTimeout, totalTimeout } = validateTimeouts({
    perServer: userPerServerTimeout,
    total: userTotalTimeout
  });

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
    // CodeQL: totalTimeout value is validated by validateTimeouts() function which caps it to MAX_TOTAL_TIMEOUT
    // preventing resource exhaustion attacks
    const overallTimeoutPromise = new Promise<never>((_, reject) => {
      overallTimeoutId = setTimeout(() => {
        reject(new Error(`[MCP] Total initialization timed out after ${totalTimeout / 1000} seconds`));
      }, totalTimeout);
    });

    // Start initialization process with overall timeout
    // Initialize servers in PARALLEL to avoid transport-type state conflicts
    // Note: Promise.race ensures the overall timeout is still respected - if totalTimeout
    // is reached, the initialization will be canceled even if some servers are still initializing
    await Promise.race([
      (async () => {
        // Create initialization promises for all servers in parallel
        const initializationPromises = serverNames.map(serverName =>
          initializeOneServer(
            serverName,
            mcpServersConfig[serverName],
            {
              logger,
              timeout: perServerTimeout,
              maxRetries,
              profileUuid,
              llmProvider,
              skipHealthChecks,
              healthResults
            }
          )
        );

        // Wait for all servers to initialize in parallel with error isolation
        const results = await Promise.allSettled(initializationPromises);

        // Process results after all initializations complete
        for (const promiseResult of results) {
          if (promiseResult.status === 'fulfilled') {
            const { serverName, status, result, statusEntry } = promiseResult.value;

            // Add status entry to tracking
            initStatus.push(statusEntry);

            if (status === 'success' && result) {
              allTools.push(...result.tools);
              cleanupFunctions.push(result.cleanup);
            } else if (status === 'error') {
              failedServers.push(serverName);
            }
            // 'skipped' status is already logged, no additional action needed
          } else {
            // Promise itself rejected (unexpected) - this should rarely happen
            // as initializeOneServer handles all errors internally
            console.error('[MCP] Unexpected promise rejection during initialization:', promiseResult.reason);

            // TODO: Integrate with error tracking service (e.g., Sentry)
            // if (typeof reportError === 'function') {
            //   reportError(promiseResult.reason, {
            //     context: 'progressive-mcp-initialization',
            //     profileUuid,
            //   });
            // }
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
