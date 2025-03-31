'use server';

import { convertMcpToLangchainTools, McpServerCleanupFn } from '@h1deya/langchain-mcp-tools';
import { addServerLogForProfile } from './mcp-playground'; // Corrected relative import

// Interface for server initialization status
export interface ServerInitStatus {
  serverName: string;
  status: 'pending' | 'success' | 'error';
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
 * Progressively initializes MCP servers with individual timeouts and status tracking
 */
export async function progressivelyInitializeMcpServers(
  mcpServersConfig: Record<string, any>,
  profileUuid: string,
  options: {
    logger: any;
    perServerTimeout?: number;
    totalTimeout?: number;
  }
): Promise<ProgressiveInitResult> {
  const { 
    logger, 
    perServerTimeout = 20000, // 20 seconds per server
    totalTimeout = 60000 // 60 seconds total
  } = options;
  
  const serverNames = Object.keys(mcpServersConfig);
  const initStatus: ServerInitStatus[] = [];
  const allTools: any[] = [];
  const cleanupFunctions: McpServerCleanupFn[] = [];
  const failedServers: string[] = [];
  
  // Create a combined cleanup function
  const combinedCleanup: McpServerCleanupFn = async () => {
    const cleanupPromises = cleanupFunctions.map(cleanup => 
      cleanup().catch(err => console.error('Error during cleanup:', err))
    );
    await Promise.allSettled(cleanupPromises);
  };
  
  // Set overall timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Total MCP initialization timed out after ${totalTimeout/1000} seconds. Some servers may still be initializing.`));
    }, totalTimeout);
  });
  
  try {
    // Start initialization process with overall timeout
    await Promise.race([
      (async () => {
        // Initialize servers one by one
        for (const serverName of serverNames) {
          const serverConfig = { [serverName]: mcpServersConfig[serverName] };
          const startTime = Date.now();
          
          // Add pending status
          initStatus.push({
            serverName,
            status: 'pending',
            startTime
          });
          
          // Log initialization start
          await addServerLogForProfile(
            profileUuid,
            'info',
            `Initializing MCP server: ${serverName}`
          );
          
          try {
            // Initialize this server with its own timeout
            const serverInitPromise = convertMcpToLangchainTools(
              serverConfig,
              { logger }
            );
            
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => {
                reject(new Error(`Server "${serverName}" initialization timed out after ${perServerTimeout/1000} seconds`));
              }, perServerTimeout);
            });
            
            // Race between server init and timeout
            const { tools, cleanup } = await Promise.race([
              serverInitPromise,
              timeoutPromise
            ]);
            
            // Update status to success
            const statusIndex = initStatus.findIndex(s => s.serverName === serverName);
            if (statusIndex >= 0) {
              initStatus[statusIndex] = {
                ...initStatus[statusIndex],
                status: 'success',
                endTime: Date.now()
              };
            }
            
            // Add tools and cleanup function
            allTools.push(...tools);
            cleanupFunctions.push(cleanup);
            
            // Log success
            await addServerLogForProfile(
              profileUuid,
              'info',
              `Successfully initialized MCP server: ${serverName}`
            );
          } catch (error) {
            // Update status to error
            const statusIndex = initStatus.findIndex(s => s.serverName === serverName);
            if (statusIndex >= 0) {
              initStatus[statusIndex] = {
                ...initStatus[statusIndex],
                status: 'error',
                error: error instanceof Error ? error.message : String(error),
                endTime: Date.now()
              };
            }
            
            // Add to failed servers
            failedServers.push(serverName);
            
            // Log error but continue with other servers
            await addServerLogForProfile(
              profileUuid,
              'error',
              `Failed to initialize MCP server "${serverName}": ${error instanceof Error ? error.message : String(error)}`
            );
            
            console.error(`Failed to initialize MCP server "${serverName}":`, error);
          }
        }
      })(),
      timeoutPromise
    ]);
    
    // If we get here, all servers were processed (either successfully or with errors)
    return {
      tools: allTools,
      cleanup: combinedCleanup,
      initStatus,
      failedServers
    };
  } catch (error) {
    // Overall timeout or other unexpected error
    console.error('Error during progressive MCP initialization:', error);
    
    // Clean up any servers that were successfully initialized
    await combinedCleanup().catch(err => 
      console.error('Error during cleanup after initialization failure:', err)
    );
    
    throw error;
  }
}
