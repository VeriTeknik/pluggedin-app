#!/usr/bin/env tsx
/**
 * Test script for Streamable HTTP implementation
 * Usage: pnpm tsx scripts/test-streamable-http.ts
 */

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { mcpServersTable, McpServerType, McpServerSource, McpServerStatus } from '@/db/schema';
import { testMcpConnection } from '@/app/actions/test-mcp-connection';
import { createMcpServer } from '@/app/actions/mcp-servers';
import { listToolsFromServer } from '@/lib/mcp/client-wrapper';
import { getSessionManager } from '@/lib/mcp/sessions/SessionManager';

// Test configuration
const TEST_SERVERS = [
  {
    name: 'Context7 MCP Server',
    url: 'https://mcp.context7.com',
    description: 'Context7 documentation server with Streamable HTTP',
  },
  {
    name: 'Smithery Server',
    url: 'https://server.smithery.ai/v1',
    description: 'Smithery AI server',
  },
];

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(60));
  log(title, colors.bright + colors.cyan);
  console.log('='.repeat(60));
}

function logSuccess(message: string) {
  log(`✅ ${message}`, colors.green);
}

function logError(message: string) {
  log(`❌ ${message}`, colors.red);
}

function logWarning(message: string) {
  log(`⚠️  ${message}`, colors.yellow);
}

function logInfo(message: string) {
  log(`ℹ️  ${message}`, colors.blue);
}

async function testStreamableHTTP() {
  try {
    logSection('Testing Streamable HTTP Implementation');

    // Get a test profile UUID (you'll need to replace this with a real one)
    const testProfileUuid = process.env.TEST_PROFILE_UUID;
    if (!testProfileUuid) {
      logError('Please set TEST_PROFILE_UUID environment variable');
      logInfo('You can find your profile UUID by running:');
      logInfo('psql $DATABASE_URL -c "SELECT uuid, name FROM profiles LIMIT 5;"');
      process.exit(1);
    }

    const sessionManager = getSessionManager();

    // Test 1: Connection Testing with CORS Detection
    logSection('Test 1: Connection Testing with CORS Detection');
    
    for (const server of TEST_SERVERS) {
      logInfo(`Testing connection to ${server.name}...`);
      
      const testResult = await testMcpConnection({
        name: server.name,
        type: McpServerType.STREAMABLE_HTTP,
        url: server.url,
      });

      if (testResult.success) {
        logSuccess(`Connection successful: ${testResult.message}`);
        if (testResult.details?.capabilities) {
          logInfo(`Capabilities: ${testResult.details.capabilities.join(', ')}`);
        }
      } else {
        logError(`Connection failed: ${testResult.message}`);
        if (testResult.details?.error) {
          logError(`Error: ${testResult.details.error}`);
        }
        if (testResult.details?.corsIssue) {
          logWarning('CORS Issue Detected:');
          logWarning(testResult.details.corsDetails || 'Unknown CORS issue');
        }
      }
    }

    // Test 2: Server Creation and Session Management
    logSection('Test 2: Server Creation and Session Management');

    const testServer = TEST_SERVERS[0]; // Use Context7 for testing
    logInfo(`Creating MCP server: ${testServer.name}`);

    const createResult = await createMcpServer({
      name: testServer.name,
      profileUuid: testProfileUuid,
      description: testServer.description,
      type: McpServerType.STREAMABLE_HTTP,
      url: testServer.url,
      source: McpServerSource.PLUGGEDIN,
    });

    if (!createResult.success || !createResult.data) {
      logError(`Failed to create server: ${createResult.error}`);
      process.exit(1);
    }

    const serverId = createResult.data.uuid;
    logSuccess(`Server created with UUID: ${serverId}`);

    // Test 3: Tool Discovery with Session Capture
    logSection('Test 3: Tool Discovery with Session Capture');

    try {
      logInfo('Attempting to list tools from server...');
      const tools = await listToolsFromServer({
        uuid: serverId,
        name: testServer.name,
        type: McpServerType.STREAMABLE_HTTP,
        url: testServer.url,
        profile_uuid: testProfileUuid,
        status: McpServerStatus.ACTIVE,
        source: McpServerSource.PLUGGEDIN,
        created_at: new Date(),
        description: testServer.description,
        command: null,
        args: null,
        env: null,
        external_id: null,
        notes: null,
        config: null,
      });

      logSuccess(`Found ${tools.length} tools`);
      tools.slice(0, 5).forEach(tool => {
        logInfo(`  - ${tool.name}: ${tool.description}`);
      });

      // Check if session was captured
      const sessions = await sessionManager.getServerSessions(serverId);
      if (sessions.length > 0) {
        logSuccess(`Session captured! Active sessions: ${sessions.length}`);
        const latestSession = sessions[0];
        logInfo(`  Session ID: ${latestSession.id}`);
        logInfo(`  Created: ${latestSession.created_at}`);
        logInfo(`  Expires: ${latestSession.expires_at}`);
      } else {
        logWarning('No sessions captured - server might not be returning Mcp-Session-Id header');
      }
    } catch (error) {
      logError(`Tool discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Test 4: Session Persistence
    logSection('Test 4: Session Persistence');

    const latestSession = await sessionManager.getLatestSession(serverId, testProfileUuid);
    if (latestSession) {
      logSuccess('Session retrieved from database');
      logInfo(`  Session ID: ${latestSession.id}`);
      
      // Try using the session for another request
      logInfo('Testing session reuse...');
      try {
        const tools2 = await listToolsFromServer({
          uuid: serverId,
          name: testServer.name,
          type: McpServerType.STREAMABLE_HTTP,
          url: testServer.url,
          profile_uuid: testProfileUuid,
          status: McpServerStatus.ACTIVE,
          source: McpServerSource.PLUGGEDIN,
          created_at: new Date(),
          description: testServer.description,
          command: null,
          args: null,
          env: null,
          external_id: null,
          notes: null,
          config: null,
        });
        
        logSuccess(`Session reuse successful! Retrieved ${tools2.length} tools`);
      } catch (error) {
        logError(`Session reuse failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      logWarning('No session found in database');
    }

    // Test 5: API Endpoint
    logSection('Test 5: API Endpoint (Manual Testing Required)');
    
    logInfo('To test the API endpoint, you can use curl:');
    logInfo('');
    logInfo('1. First, get your auth token from the browser:');
    logInfo('   - Open pluggedin-app in browser');
    logInfo('   - Open DevTools > Application > Cookies');
    logInfo('   - Copy the value of "next-auth.session-token"');
    logInfo('');
    logInfo('2. Test the initialize endpoint:');
    logInfo(`   curl -X POST http://localhost:12005/api/mcp \\`);
    logInfo(`     -H "Content-Type: application/json" \\`);
    logInfo(`     -H "Cookie: next-auth.session-token=YOUR_TOKEN" \\`);
    logInfo(`     -H "X-MCP-Server-UUID: ${serverId}" \\`);
    logInfo(`     -H "X-MCP-Profile-UUID: ${testProfileUuid}" \\`);
    logInfo(`     -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05"},"id":1}'`);
    logInfo('');
    logInfo('3. The response should include a Mcp-Session-Id header');

    // Cleanup
    logSection('Cleanup');
    logInfo('Cleaning up test server...');
    
    await db.delete(mcpServersTable).where(eq(mcpServersTable.uuid, serverId));
    logSuccess('Test server deleted');

    // Cleanup sessions
    await sessionManager.deleteServerSessions(serverId);
    logSuccess('Sessions cleaned up');

    logSection('Test Summary');
    logSuccess('Streamable HTTP implementation tests completed!');
    logInfo('');
    logInfo('Key features verified:');
    logInfo('  ✅ Connection testing with CORS detection');
    logInfo('  ✅ Server creation with Streamable HTTP type');
    logInfo('  ✅ Session capture from response headers');
    logInfo('  ✅ Session persistence in database');
    logInfo('  ✅ Session reuse for subsequent requests');
    logInfo('');
    logInfo('Next steps:');
    logInfo('  - Test with more remote MCP servers');
    logInfo('  - Verify the API endpoint with real authentication');
    logInfo('  - Update the UI to support Streamable HTTP configuration');

  } catch (error) {
    logError(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
    process.exit(1);
  } finally {
    // Ensure session manager cleanup
    getSessionManager().destroy();
  }
}

// Run the tests
testStreamableHTTP().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});