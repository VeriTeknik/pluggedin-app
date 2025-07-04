'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db/client';
import { mcpServers } from '@/db/schema';
import { getAuthAndProject } from '@/lib/auth';
import { ConsoleCapture } from '@/lib/utils/console-capture';

interface DiscoveryResult {
  success: boolean;
  error?: string;
  tools?: any[];
  resources?: any[];
  prompts?: any[];
  logs: string[];
}

/**
 * Server action to discover MCP server capabilities with console log capture
 */
export async function discoverServerWithLogs(
  serverUuid: string
): Promise<DiscoveryResult> {
  try {
    const { userId, projectUuid } = await getAuthAndProject();
    
    if (!userId || !projectUuid) {
      return {
        success: false,
        error: 'Authentication required',
        logs: [],
      };
    }

    // Use ConsoleCapture to capture all console output during discovery
    const { result, output } = await ConsoleCapture.captureAsync(async () => {
      console.log('=== MCP Discovery Started ===');
      console.log(`Server UUID: ${serverUuid}`);
      console.log(`Project UUID: ${projectUuid}`);
      
      // Fetch server configuration
      console.log('Fetching server configuration from database...');
      const server = await db
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.uuid, serverUuid))
        .limit(1);

      if (!server.length) {
        console.error('Server not found in database');
        return {
          success: false,
          error: 'Server not found',
        };
      }

      const serverConfig = server[0];
      console.log(`Server name: ${serverConfig.name}`);
      console.log(`Server type: ${serverConfig.transport_type}`);

      try {
        // Here you would integrate with your actual MCP discovery logic
        // For demonstration, we'll simulate the discovery process
        console.info('Initializing MCP connection...');
        
        // Simulate connection delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log('Connection established');
        console.log('Requesting server capabilities...');
        
        // Simulate capability discovery
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const mockTools = [
          { name: 'tool1', description: 'First tool' },
          { name: 'tool2', description: 'Second tool' },
        ];
        
        const mockResources = [
          { uri: 'resource://example', name: 'Example Resource' },
        ];
        
        console.log(`Discovered ${mockTools.length} tools`);
        console.log(`Discovered ${mockResources.length} resources`);
        console.log('Discovery completed successfully');
        
        // Update last discovered timestamp
        await db
          .update(mcpServers)
          .set({ 
            last_discovered: new Date(),
            // You might also want to store discovered capabilities
          })
          .where(eq(mcpServers.uuid, serverUuid));
        
        console.log('=== MCP Discovery Completed ===');
        
        return {
          success: true,
          tools: mockTools,
          resources: mockResources,
          prompts: [],
        };
      } catch (error) {
        console.error('Discovery error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Discovery failed',
        };
      }
    });

    // Revalidate the page to show updated data
    revalidatePath('/mcp-servers');
    
    return {
      ...result,
      logs: output,
    };
  } catch (error) {
    console.error('Unexpected error in discoverServerWithLogs:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected error',
      logs: [],
    };
  }
}

/**
 * Server action to test console capture functionality
 */
export async function testConsoleCapture(): Promise<{
  success: boolean;
  logs: string[];
}> {
  const { result, output } = await ConsoleCapture.captureAsync(async () => {
    console.log('This is a regular log');
    console.info('This is an info message');
    console.warn('This is a warning');
    console.error('This is an error (not thrown)');
    console.debug('This is a debug message');
    
    console.log('Object logging:', { key: 'value', nested: { data: true } });
    console.log('Multiple', 'arguments', 'test', 123, true);
    
    return { success: true };
  });
  
  return {
    ...result,
    logs: output,
  };
}