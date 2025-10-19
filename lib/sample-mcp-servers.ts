/**
 * Sample MCP servers to be added for new users
 */

import { discoverSingleServerToolsInternal } from '@/app/actions/discover-mcp-tools';
import { db } from '@/db';
import { mcpServersTable, McpServerType } from '@/db/schema';

export const SAMPLE_MCP_SERVERS = [
  {
    name: 'Context7 MCP',
    slug: 'context7-mcp',
    type: McpServerType.STREAMABLE_HTTP,
    description: 'Access up-to-date documentation for any library. Get API key from https://context7.com/dashboard',
    url: 'https://mcp.context7.com/mcp',
    headers: {
      Authorization: 'Bearer YOUR_API_KEY_HERE'
    },
    notes: 'To use Context7:\n1. Get your API key from https://context7.com/dashboard\n2. Edit this server and add to Headers:\n   Authorization: Bearer your_api_key\n3. Save and the server will be ready to use!'
  },
  {
    name: 'Whois MCP',
    slug: 'whois-mcp',
    type: McpServerType.STDIO,
    description: 'MCP Server for whois lookups.',
    command: 'npx',
    args: ['@bharathvaj/whois-mcp'],
    env: {},
    notes: 'Provides whois lookup capabilities for domain information.'
  },
  {
    name: 'Pluggedin Random Number Generator MCP',
    slug: 'pluggedin-random-number-generator',
    type: McpServerType.STDIO,
    description: 'Because even AI needs to roll the dice properly.',
    command: 'npx',
    args: ['pluggedin-random-number-generator-mcp'],
    env: {},
    notes: 'A simple random number generator for testing MCP functionality.'
  }
];

/**
 * Runs async tasks with concurrency limit using a worker pool pattern
 * This ensures the concurrency limit is strictly maintained
 * @param tasks Array of async functions to execute
 * @param limit Maximum number of concurrent executions
 */
async function runWithConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let nextIndex = 0;

  // Worker function that processes tasks from the queue
  async function worker() {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= tasks.length) break;

      try {
        const value = await tasks[currentIndex]();
        results[currentIndex] = { status: 'fulfilled', value };
      } catch (reason) {
        results[currentIndex] = { status: 'rejected', reason };
      }
    }
  }

  // Start up to 'limit' workers in parallel
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, () => worker())
  );

  return results;
}

/**
 * Add sample MCP servers for a new user's profile and trigger discovery
 */
export async function addSampleMcpServersForNewUser(profileUuid: string) {
  try {
    const serversToAdd = SAMPLE_MCP_SERVERS.map(server => ({
      profile_uuid: profileUuid,
      name: server.name,
      slug: server.slug,
      description: server.description,
      type: server.type,
      command: server.type === McpServerType.STDIO ? server.command : undefined,
      args: server.type === McpServerType.STDIO ? server.args : undefined,
      env: server.type === McpServerType.STDIO ? server.env : undefined,
      url: server.type === McpServerType.STREAMABLE_HTTP ? server.url : undefined,
      headers: server.type === McpServerType.STREAMABLE_HTTP ? server.headers : undefined,
      notes: server.notes,
      created_at: new Date(),
      updated_at: new Date()
    }));

    // Insert servers and get the created UUIDs
    const insertedServers = await db.insert(mcpServersTable).values(serversToAdd).returning();

    console.log(`✅ Added ${SAMPLE_MCP_SERVERS.length} sample MCP servers for profile ${profileUuid}`);

    // Trigger discovery for each server with concurrency limit (fire-and-forget, don't block signup)
    const discoveryTasks = insertedServers.map(server => () =>
      discoverSingleServerToolsInternal(profileUuid, server.uuid)
        .then(result => ({ server: server.name, ...result }))
        .catch(err => ({
          server: server.name,
          success: false,
          error: err.message
        }))
    );

    // Run discoveries with concurrency limit of 2 to prevent overwhelming the system
    runWithConcurrencyLimit(discoveryTasks, 2)
      .then(results => {
        const failures = results.filter(
          r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)
        );

        if (failures.length > 0) {
          console.error(
            `[Sample Servers] Discovery failed for ${failures.length}/${insertedServers.length} servers`,
            failures
          );
        } else {
          console.log(`[Sample Servers] Successfully discovered tools for all ${insertedServers.length} servers`);
        }
      })
      .catch(err => {
        console.error('[Sample Servers] Unexpected error during discovery:', err);
      });

    return true;
  } catch (error) {
    console.error('Failed to add sample MCP servers:', error);
    // Don't fail the signup process if sample servers can't be added
    return false;
  }
}