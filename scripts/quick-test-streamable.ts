#!/usr/bin/env tsx
/**
 * Quick test for Streamable HTTP - tests just the connection
 * Usage: pnpm tsx scripts/quick-test-streamable.ts
 */

import { testMcpConnection } from '@/app/actions/test-mcp-connection';
import { McpServerType } from '@/db/schema';

async function quickTest() {
  console.log('🧪 Testing Streamable HTTP Connection...\n');

  const servers = [
    {
      name: 'Context7 MCP',
      url: 'https://mcp.context7.com',
    },
    {
      name: 'Smithery AI',
      url: 'https://server.smithery.ai/v1',
    },
  ];

  for (const server of servers) {
    console.log(`\n📡 Testing ${server.name} (${server.url})`);
    console.log('-'.repeat(50));

    const result = await testMcpConnection({
      name: server.name,
      type: McpServerType.STREAMABLE_HTTP,
      url: server.url,
    });

    if (result.success) {
      console.log(`✅ Success: ${result.message}`);
      if (result.details?.capabilities) {
        console.log(`   Capabilities: ${result.details.capabilities.join(', ')}`);
      }
    } else {
      console.log(`❌ Failed: ${result.message}`);
      if (result.details?.error) {
        console.log(`   Error: ${result.details.error}`);
      }
      if (result.details?.corsIssue) {
        console.log(`\n⚠️  CORS Issue Detected!`);
        console.log(`   ${result.details.corsDetails}`);
      }
    }
  }

  console.log('\n✨ Test complete!\n');
}

quickTest().catch(console.error);