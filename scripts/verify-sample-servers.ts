#!/usr/bin/env node

/**
 * Script to verify sample MCP servers are properly configured
 * Run with: npx tsx scripts/verify-sample-servers.ts
 */

import { SAMPLE_MCP_SERVERS } from '../lib/sample-mcp-servers';
import { McpServerType } from '../db/schema';

console.log('🔍 Verifying Sample MCP Servers Configuration\n');
console.log('=' .repeat(60));

// Check that we have exactly 3 sample servers
if (SAMPLE_MCP_SERVERS.length !== 3) {
  console.error(`❌ Expected 3 sample servers, found ${SAMPLE_MCP_SERVERS.length}`);
  process.exit(1);
}

console.log(`✅ Found ${SAMPLE_MCP_SERVERS.length} sample servers\n`);

// Verify each server configuration
SAMPLE_MCP_SERVERS.forEach((server, index) => {
  console.log(`📦 Server ${index + 1}: ${server.name}`);
  console.log(`   Slug: ${server.slug}`);
  console.log(`   Type: ${server.type}`);
  console.log(`   Description: ${server.description.substring(0, 50)}...`);

  // Type-specific validation
  if (server.type === McpServerType.STDIO) {
    if (!server.command || !server.args) {
      console.error(`   ❌ STDIO server missing command or args`);
      process.exit(1);
    }
    console.log(`   ✅ Command: ${server.command} ${server.args.join(' ')}`);
  } else if (server.type === McpServerType.STREAMABLE_HTTP) {
    if (!server.url) {
      console.error(`   ❌ HTTP server missing URL`);
      process.exit(1);
    }
    console.log(`   ✅ URL: ${server.url}`);
    if (server.headers) {
      console.log(`   ✅ Has headers configuration`);
    }
  }

  if (server.notes) {
    console.log(`   ℹ️  Notes: ${server.notes.substring(0, 40)}...`);
  }

  console.log();
});

console.log('=' .repeat(60));
console.log('✨ All sample servers are properly configured!');
console.log('\n📝 These servers will be automatically added for:');
console.log('   1. New email signups (after email verification)');
console.log('   2. New OAuth signups (Google, GitHub, etc.)');
console.log('\n🔗 Setup guide available at: https://plugged.in/setup-guide');