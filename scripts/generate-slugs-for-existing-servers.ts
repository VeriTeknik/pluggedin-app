/**
 * Script to generate slugs for existing MCP servers that don't have slugs yet
 * This addresses the issue where existing servers show "Not set" for Tool Prefix Slug
 */

import { sql, and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { mcpServersTable } from '@/db/schema';

async function generateSlugsForExistingServers() {
  console.log('Starting slug generation for existing servers...');

  // Get all servers that don't have slugs
  const serversWithoutSlugs = await db
    .select({
      uuid: mcpServersTable.uuid,
      name: mcpServersTable.name,
      profile_uuid: mcpServersTable.profile_uuid,
      slug: mcpServersTable.slug
    })
    .from(mcpServersTable)
    .where(sql`${mcpServersTable.slug} IS NULL OR ${mcpServersTable.slug} = ''`);

  console.log(`Found ${serversWithoutSlugs.length} servers without slugs`);

  let successCount = 0;
  let errorCount = 0;

  // Group servers by profile and name to handle conflicts properly
  const serversByProfileAndName = new Map<string, typeof serversWithoutSlugs>();

  for (const server of serversWithoutSlugs) {
    const key = `${server.profile_uuid}:${server.name}`;
    if (!serversByProfileAndName.has(key)) {
      serversByProfileAndName.set(key, []);
    }
    serversByProfileAndName.get(key)!.push(server);
  }

  console.log(`Grouped into ${serversByProfileAndName.size} unique name-profile combinations`);

  // Process each group
  for (const [key, servers] of serversByProfileAndName) {
    const [profileUuid, serverName] = key.split(':');

    console.log(`Processing ${servers.length} servers named "${serverName}" in profile ${profileUuid}`);

    // For each group of servers with the same name in the same profile
    for (let i = 0; i < servers.length; i++) {
      const server = servers[i];
      try {
        // Generate base slug from server name
        const baseSlug = server.name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

        // If this is the first server with this name, try the base slug
        // If there are multiple servers with the same name, always add a suffix
        let slug: string;
        if (servers.length === 1) {
          // Check if base slug is available (including existing servers with slugs)
          const existing = await db
            .select({ uuid: mcpServersTable.uuid })
            .from(mcpServersTable)
            .where(
              and(
                eq(mcpServersTable.slug, baseSlug),
                eq(mcpServersTable.profile_uuid, server.profile_uuid)
              )
            )
            .limit(1);

          if (existing.length === 0) {
            slug = baseSlug;
          } else {
            // Base slug taken, add suffix
            slug = `${baseSlug}-1`;
          }
        } else {
          // Multiple servers with same name, always add suffix starting from 1
          slug = `${baseSlug}-${i + 1}`;
        }

        // Final check to ensure uniqueness (in case of race conditions)
        let finalSlug = slug;
        let uniquenessCounter = 1;
        while (true) {
          const existing = await db
            .select({ uuid: mcpServersTable.uuid })
            .from(mcpServersTable)
            .where(
              and(
                eq(mcpServersTable.slug, finalSlug),
                eq(mcpServersTable.profile_uuid, server.profile_uuid)
              )
            )
            .limit(1);

          if (existing.length === 0) {
            break; // Slug is available
          }

          uniquenessCounter++;
          finalSlug = `${slug}-${uniquenessCounter}`;

          // Prevent infinite loop
          if (uniquenessCounter > 50) {
            finalSlug = `${baseSlug}-${server.uuid.slice(0, 8)}`;
            break;
          }
        }

        // Set the slug directly in the database
        await db
          .update(mcpServersTable)
          .set({ slug: finalSlug })
          .where(
            and(
              eq(mcpServersTable.uuid, server.uuid),
              eq(mcpServersTable.profile_uuid, server.profile_uuid)
            )
          );

        console.log(`✅ Generated slug "${finalSlug}" for server: ${server.name} (${server.uuid})`);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to generate slug for server ${server.uuid}:`, error);
        errorCount++;
      }
    }
  }

  console.log(`\nSlug generation completed:`);
  console.log(`✅ Successfully generated: ${successCount} slugs`);
  console.log(`❌ Failed to generate: ${errorCount} slugs`);
  console.log(`📊 Total processed: ${serversWithoutSlugs.length} servers`);
}

generateSlugsForExistingServers()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });