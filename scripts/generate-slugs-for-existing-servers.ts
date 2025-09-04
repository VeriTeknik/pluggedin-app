/**
 * Optimized migration script to generate slugs for existing MCP servers
 * Performance improvements:
 * 1. Batch fetch existing slugs per profile
 * 2. Use Set for O(1) lookups
 * 3. Batch updates where possible
 * 4. Process profiles in parallel with concurrency limit
 */

import { and, eq, isNotNull,isNull } from 'drizzle-orm';

import { db } from '../db';
import { mcpServersTable } from '../db/schema';
import { generateSlug } from '../lib/utils/slug-utils';

const BATCH_SIZE = 100;
const PARALLEL_PROFILES = 5;

async function generateSlugForServer(
  server: { uuid: string; name: string; profile_uuid: string },
  existingSlugs: Set<string>
): Promise<{ uuid: string; slug: string }> {
  const baseSlug = generateSlug(server.name);
  
  // Find unique slug
  let finalSlug = baseSlug;
  let counter = 1;
  
  while (existingSlugs.has(finalSlug)) {
    finalSlug = `${baseSlug}-${counter}`;
    counter++;
    
    // Prevent infinite loop
    if (counter > 100) {
      // Use UUID suffix as last resort
      finalSlug = `${baseSlug}-${server.uuid.slice(0, 8)}`;
      break;
    }
  }
  
  // Add to set to prevent duplicates in this batch
  existingSlugs.add(finalSlug);
  
  return { uuid: server.uuid, slug: finalSlug };
}

async function processProfile(profileUuid: string) {
  console.log('Processing profile: %s', profileUuid);
  
  try {
    // Fetch all existing slugs for this profile at once
    const existingSlugsResult = await db
      .select({ slug: mcpServersTable.slug })
      .from(mcpServersTable)
      .where(
        and(
          eq(mcpServersTable.profile_uuid, profileUuid),
          isNotNull(mcpServersTable.slug)
        )
      );
    
    const existingSlugs = new Set(
      existingSlugsResult
        .map(s => s.slug)
        .filter((s): s is string => s !== null)
    );
    
    // Fetch servers without slugs for this profile
    const serversWithoutSlugs = await db
      .select({
        uuid: mcpServersTable.uuid,
        name: mcpServersTable.name,
        profile_uuid: mcpServersTable.profile_uuid
      })
      .from(mcpServersTable)
      .where(
        and(
          eq(mcpServersTable.profile_uuid, profileUuid),
          isNull(mcpServersTable.slug)
        )
      );
    
    if (serversWithoutSlugs.length === 0) {
      console.log('No servers without slugs in profile %s', profileUuid);
      return { profileUuid, processed: 0, errors: 0 };
    }
    
    console.log('Found %d servers without slugs in profile %s', serversWithoutSlugs.length, profileUuid);
    
    // Generate slugs for all servers
    const updates = await Promise.all(
      serversWithoutSlugs.map(server => 
        generateSlugForServer(server, existingSlugs)
      )
    );
    
    // Batch update servers
    let processed = 0;
    let errors = 0;
    
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      
      try {
        // Update each server in the batch
        await Promise.all(
          batch.map(({ uuid, slug }) =>
            db
              .update(mcpServersTable)
              .set({ slug })
              .where(
                and(
                  eq(mcpServersTable.uuid, uuid),
                  eq(mcpServersTable.profile_uuid, profileUuid)
                )
              )
          )
        );
        
        processed += batch.length;
        console.log('Updated %d servers in profile %s', batch.length, profileUuid);
      } catch (error) {
        console.error('Error updating batch in profile %s:', profileUuid, error);
        errors += batch.length;
      }
    }
    
    return { profileUuid, processed, errors };
  } catch (error) {
    console.error('Error processing profile %s:', profileUuid, error);
    return { profileUuid, processed: 0, errors: 1 };
  }
}

async function processProfilesInBatches(profileUuids: string[]) {
  const results = [];
  
  for (let i = 0; i < profileUuids.length; i += PARALLEL_PROFILES) {
    const batch = profileUuids.slice(i, i + PARALLEL_PROFILES);
    const batchResults = await Promise.all(
      batch.map(profileUuid => processProfile(profileUuid))
    );
    results.push(...batchResults);
    
    console.log('Completed %d of %d profiles', Math.min(i + PARALLEL_PROFILES, profileUuids.length), profileUuids.length);
  }
  
  return results;
}

async function main() {
  console.log('Starting optimized slug generation for existing MCP servers...');
  
  try {
    // Get all unique profile UUIDs
    const profiles = await db
      .selectDistinct({ profile_uuid: mcpServersTable.profile_uuid })
      .from(mcpServersTable)
      .where(isNull(mcpServersTable.slug));
    
    const profileUuids = profiles.map(p => p.profile_uuid);
    
    if (profileUuids.length === 0) {
      console.log('All servers already have slugs. Nothing to do.');
      return;
    }
    
    console.log('Found %d profiles with servers missing slugs', profileUuids.length);
    
    // Process profiles with concurrency limit
    const results = await processProfilesInBatches(profileUuids);
    
    // Calculate totals
    const totalProcessed = results.reduce((sum, r) => sum + r.processed, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
    
    console.log('\n=== Migration Complete ===');
    console.log('Total profiles processed: %d', profileUuids.length);
    console.log('Total servers updated: %d', totalProcessed);
    console.log('Total errors: %d', totalErrors);
    
    if (totalErrors > 0) {
      console.error('Some servers failed to update. Please check the logs above.');
      process.exit(1);
    }
    
    console.log('All servers have been successfully assigned slugs!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});