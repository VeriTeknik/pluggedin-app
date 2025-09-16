/**
 * Sample MCP servers to be added for new users
 */

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
 * Add sample MCP servers for a new user's profile
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

    await db.insert(mcpServersTable).values(serversToAdd);

    console.log(`✅ Added ${SAMPLE_MCP_SERVERS.length} sample MCP servers for profile ${profileUuid}`);
    return true;
  } catch (error) {
    console.error('Failed to add sample MCP servers:', error);
    // Don't fail the signup process if sample servers can't be added
    return false;
  }
}