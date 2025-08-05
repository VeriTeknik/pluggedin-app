// Client-safe version of progressive MCP initialization
// This doesn't use server actions and can be used in API routes

import { convertMcpToLangchainTools, McpServerCleanupFn, McpServersConfig } from '@h1deya/langchain-mcp-tools';

export interface ServerInitStatus {
  serverName: string;
  status: 'pending' | 'success' | 'error' | 'skipped';
  error?: string;
  startTime: number;
  endTime?: number;
}

export interface ProgressiveInitResult {
  tools: any[];
  cleanup: McpServerCleanupFn;
  initStatus: ServerInitStatus[];
  failedServers: string[];
}

/**
 * Client-safe version of progressively initializing MCP servers
 * This version doesn't use server actions and can be used in API routes
 */
export async function progressivelyInitializeMcpServersClient(
  mcpServersConfig: Record<string, any>,
  options: {
    logger: any;
    perServerTimeout?: number;
    totalTimeout?: number;
    llmProvider?: 'anthropic' | 'openai' | 'google_genai' | 'google_gemini' | 'none';
  }
): Promise<ProgressiveInitResult> {
  const {
    logger,
    perServerTimeout = 20000,
    totalTimeout = 60000,
    llmProvider
  } = options;

  const initStatus: ServerInitStatus[] = [];
  const allTools: any[] = [];
  const cleanupFunctions: McpServerCleanupFn[] = [];
  const failedServers: string[] = [];

  let isCleaningUp = false;
  
  // Combined cleanup function
  const combinedCleanup: McpServerCleanupFn = async () => {
    if (isCleaningUp) return;
    isCleaningUp = true;

    const cleanupPromises = cleanupFunctions.map(cleanup =>
      cleanup().catch(err => logger.error('[MCP] Error during cleanup:', err))
    );

    try {
      await Promise.race([
        Promise.allSettled(cleanupPromises),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Cleanup timeout')), 15000)
        )
      ]);
    } catch (error) {
      logger.error('[MCP] Combined cleanup error:', error);
    }
  };

  const totalStartTime = Date.now();

  try {
    // Initialize servers one by one
    for (const [serverName, serverConfig] of Object.entries(mcpServersConfig)) {
      const statusEntry: ServerInitStatus = {
        serverName,
        status: 'pending',
        startTime: Date.now(),
      };
      initStatus.push(statusEntry);

      // Check total timeout
      if (Date.now() - totalStartTime > totalTimeout) {
        statusEntry.status = 'error';
        statusEntry.error = 'Skipped due to total timeout';
        statusEntry.endTime = Date.now();
        failedServers.push(serverName);
        logger.warn(`[MCP] Skipping ${serverName} due to total timeout`);
        continue;
      }

      try {
        logger.info(`[MCP] Initializing server: ${serverName}`);
        
        const configForTool: McpServersConfig = { [serverName]: serverConfig };
        
        const initPromise = convertMcpToLangchainTools(
          configForTool,
          { logger, llmProvider }
        );

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Server "${serverName}" initialization timed out`));
          }, perServerTimeout);
        });

        const result = await Promise.race([initPromise, timeoutPromise]);
        
        statusEntry.status = 'success';
        statusEntry.endTime = Date.now();
        allTools.push(...result.tools);
        cleanupFunctions.push(result.cleanup);
        
        logger.info(`[MCP] Server ${serverName} initialized with ${result.tools.length} tools`);
      } catch (error) {
        statusEntry.status = 'error';
        statusEntry.error = error instanceof Error ? error.message : String(error);
        statusEntry.endTime = Date.now();
        failedServers.push(serverName);
        
        logger.error(`[MCP] Failed to initialize ${serverName}:`, error);
      }
    }

    return {
      tools: allTools,
      cleanup: combinedCleanup,
      initStatus,
      failedServers,
    };
  } catch (error) {
    logger.error('[MCP] Progressive initialization error:', error);
    return {
      tools: allTools,
      cleanup: combinedCleanup,
      initStatus,
      failedServers: Object.keys(mcpServersConfig),
    };
  }
}