#!/usr/bin/env node

/**
 * Script to add sample MCP servers to Plugged.in
 * Run with: npx tsx scripts/add-sample-mcp-servers.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { mcpServersTable, profilesTable, projectsTable, users as usersTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const db = drizzle(pool);

const SAMPLE_SERVERS = [
  {
    name: 'Context7 MCP',
    type: 'STREAMABLE_HTTP' as const,
    description: 'Access up-to-date documentation for any library. Get API key from https://context7.com/dashboard',
    url: 'https://mcp.context7.com/mcp',
    headers: {
      Authorization: 'Bearer YOUR_API_KEY_HERE'
    },
    notes: 'To use Context7:\n1. Get your API key from https://context7.com/dashboard\n2. Edit this server and add to Headers:\n   Authorization: Bearer your_api_key\n3. Save and the server will be ready to use!'
  },
  {
    name: 'Whois MCP',
    type: 'STDIO' as const,
    description: 'MCP Server for whois lookups.',
    command: 'npx',
    args: ['@bharathvaj/whois-mcp'],
    env: {},
    notes: 'Provides whois lookup capabilities for domain information.'
  },
  {
    name: 'Pluggedin Random Number Generator MCP',
    type: 'STDIO' as const,
    description: 'Because even AI needs to roll the dice properly.',
    command: 'npx',
    args: ['pluggedin-random-number-generator-mcp'],
    env: {},
    notes: 'A simple random number generator for testing MCP functionality.'
  }
];

async function addSampleServers() {
  try {
    console.log('🚀 Adding sample MCP servers...\n');

    // Get the first user for testing
    const users = await db.select().from(usersTable).limit(1);
    if (!users.length) {
      console.error('❌ No users found. Please create a user first.');
      await pool.end();
      process.exit(1);
    }
    const user = users[0];

    console.log(`👤 Using user: ${user.email}\n`);

    // Get the user's active project
    const projects = await db.select().from(projectsTable)
      .where(eq(projectsTable.user_id, user.id))
      .limit(1);

    if (!projects.length) {
      console.error('❌ No project found for user. Please create a project first.');
      await pool.end();
      process.exit(1);
    }
    const project = projects[0];

    console.log(`📁 Using project: ${project.name}\n`);

    // Get the active profile or any profile for this project
    let profile;
    if (project.active_profile_uuid) {
      const profiles = await db.select().from(profilesTable)
        .where(eq(profilesTable.uuid, project.active_profile_uuid))
        .limit(1);
      profile = profiles[0];
    }

    if (!profile) {
      // Get any profile for this project
      const profiles = await db.select().from(profilesTable)
        .where(eq(profilesTable.project_uuid, project.uuid))
        .limit(1);

      if (!profiles.length) {
        console.error('❌ No profiles found for project. Please create a profile first.');
        await pool.end();
        process.exit(1);
      }
      profile = profiles[0];

      // Update the project to set this as the active profile
      await db.update(projectsTable)
        .set({ active_profile_uuid: profile.uuid })
        .where(eq(projectsTable.uuid, project.uuid));

      console.log(`✅ Set active profile: ${profile.name}\n`);
    }

    console.log(`👤 Using profile: ${profile.name}\n`);

    // Add each sample server
    for (const server of SAMPLE_SERVERS) {
      try {
        // Check if server already exists
        const existing = await db.select().from(mcpServersTable)
          .where(eq(mcpServersTable.name, server.name))
          .limit(1);

        if (existing.length > 0) {
          console.log(`⚠️  Server "${server.name}" already exists, skipping...`);
          continue;
        }

        // Insert the server
        await db.insert(mcpServersTable).values({
          profile_uuid: profile.uuid,
          name: server.name,
          description: server.description,
          type: server.type,
          command: server.type === 'STDIO' ? server.command : undefined,
          args: server.type === 'STDIO' ? server.args : undefined,
          env: server.type === 'STDIO' ? server.env : undefined,
          url: server.type === 'STREAMABLE_HTTP' ? server.url : undefined,
          headers: server.type === 'STREAMABLE_HTTP' ? server.headers : undefined,
          notes: server.notes,
          created_at: new Date(),
          updated_at: new Date()
        });

        console.log(`✅ Added "${server.name}"`);
      } catch (error) {
        console.error(`❌ Failed to add "${server.name}":`, error);
      }
    }

    console.log('\n✨ Sample MCP servers added successfully!');
    console.log('\n📚 Setup Guide:');
    console.log('1. Visit https://plugged.in/setup-guide');
    console.log('2. Pick your desired MCP client (Claude Desktop, Continue Dev, etc.)');
    console.log('3. Install the Plugged.in proxy following the guide');
    console.log('4. For Context7, remember to add your API key in the server configuration');
    console.log('\n🔑 To get a Context7 API key:');
    console.log('   Visit https://context7.com/dashboard');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

// Run the script
addSampleServers();