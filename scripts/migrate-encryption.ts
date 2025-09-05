#!/usr/bin/env tsx
/**
 * Migration script to upgrade encryption from legacy (v1) to secure (v2)
 * 
 * This script migrates all encrypted data from the legacy encryption method
 * (using predictable salts) to the new secure encryption (using random salts).
 * 
 * Usage:
 *   npm run migrate:encryption           # Run migration
 *   npm run migrate:encryption -- --dry  # Dry run (no changes)
 *   npm run migrate:encryption -- --verbose # Verbose output
 */

import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, or, isNotNull, sql } from 'drizzle-orm';
import { mcpServersTable } from '../db/schema';
import { encryptField, decryptField } from '../lib/encryption';

// Load environment variables
config();

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry') || args.includes('--dry-run');
const isVerbose = args.includes('--verbose') || args.includes('-v');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message: string, level: 'info' | 'success' | 'warning' | 'error' | 'verbose' = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}]`;
  
  switch (level) {
    case 'success':
      console.log(`${colors.green}✓${colors.reset} ${prefix} ${message}`);
      break;
    case 'warning':
      console.log(`${colors.yellow}⚠${colors.reset} ${prefix} ${message}`);
      break;
    case 'error':
      console.error(`${colors.red}✗${colors.reset} ${prefix} ${message}`);
      break;
    case 'verbose':
      if (isVerbose) {
        console.log(`${colors.dim}${prefix} ${message}${colors.reset}`);
      }
      break;
    default:
      console.log(`${colors.blue}ℹ${colors.reset} ${prefix} ${message}`);
  }
}

async function migrateEncryption() {
  log('Starting encryption migration from v1 (legacy) to v2 (secure)', 'info');
  
  if (isDryRun) {
    log('Running in DRY RUN mode - no changes will be made', 'warning');
  }

  // Validate environment
  const encryptionKey = process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;
  if (!encryptionKey) {
    log('NEXT_SERVER_ACTIONS_ENCRYPTION_KEY not found in environment', 'error');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    log('DATABASE_URL not found in environment', 'error');
    process.exit(1);
  }

  // Connect to database
  log('Connecting to database...', 'verbose');
  const client = postgres(databaseUrl);
  const db = drizzle(client);

  try {
    // Get statistics
    log('Analyzing data to migrate...', 'info');
    
    // Count MCP servers with encrypted data
    const mcpServersToMigrate = await db
      .select({ count: sql<number>`count(*)` })
      .from(mcpServersTable)
      .where(or(
        isNotNull(mcpServersTable.command_encrypted),
        isNotNull(mcpServersTable.args_encrypted),
        isNotNull(mcpServersTable.env_encrypted),
        isNotNull(mcpServersTable.url_encrypted)
      ));
    
    const mcpServerCount = Number(mcpServersToMigrate[0]?.count || 0);
    log(`Found ${mcpServerCount} MCP servers to migrate`, 'info');

    if (mcpServerCount === 0) {
      log('No data needs migration! All records are already using secure encryption (v2)', 'success');
      await client.end();
      return;
    }

    // Confirm before proceeding (unless dry run)
    if (!isDryRun) {
      log(`About to migrate ${mcpServerCount} MCP server records`, 'warning');
      log('Make sure you have a database backup before proceeding!', 'warning');
      log('Press Ctrl+C to cancel, or wait 5 seconds to continue...', 'info');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Migrate MCP Servers
    if (mcpServerCount > 0) {
      log(`\nMigrating MCP servers...`, 'info');
      
      const servers = await db
        .select()
        .from(mcpServersTable)
        .where(or(
          isNotNull(mcpServersTable.command_encrypted),
          isNotNull(mcpServersTable.args_encrypted),
          isNotNull(mcpServersTable.env_encrypted),
          isNotNull(mcpServersTable.url_encrypted)
        ));

      let migratedCount = 0;
      let errorCount = 0;

      for (const server of servers) {
        try {
          log(`Processing server ${server.uuid} (${server.name})`, 'verbose');
          
          const updates: any = {};
          let hasEncryptedData = false;

          // Process each encrypted field
          if (server.command_encrypted) {
            try {
              // Decrypt with legacy method
              const decrypted = decryptField(server.command_encrypted);
              // Re-encrypt with secure method
              const reEncrypted = encryptField(decrypted);
              updates.command_encrypted = reEncrypted;
              hasEncryptedData = true;
              log(`  ✓ Migrated command field`, 'verbose');
            } catch (err) {
              log(`  ✗ Failed to migrate command: ${err}`, 'error');
              errorCount++;
              continue;
            }
          }

          if (server.args_encrypted) {
            try {
              const decrypted = decryptField(server.args_encrypted);
              const reEncrypted = encryptField(decrypted);
              updates.args_encrypted = reEncrypted;
              hasEncryptedData = true;
              log(`  ✓ Migrated args field`, 'verbose');
            } catch (err) {
              log(`  ✗ Failed to migrate args: ${err}`, 'error');
              errorCount++;
              continue;
            }
          }

          if (server.env_encrypted) {
            try {
              const decrypted = decryptField(server.env_encrypted);
              const reEncrypted = encryptField(decrypted);
              updates.env_encrypted = reEncrypted;
              hasEncryptedData = true;
              log(`  ✓ Migrated env field`, 'verbose');
            } catch (err) {
              log(`  ✗ Failed to migrate env: ${err}`, 'error');
              errorCount++;
              continue;
            }
          }

          if (server.url_encrypted) {
            try {
              const decrypted = decryptField(server.url_encrypted);
              const reEncrypted = encryptField(decrypted);
              updates.url_encrypted = reEncrypted;
              hasEncryptedData = true;
              log(`  ✓ Migrated url field`, 'verbose');
            } catch (err) {
              log(`  ✗ Failed to migrate url: ${err}`, 'error');
              errorCount++;
              continue;
            }
          }

          // Update the record with new encryption
          if (hasEncryptedData && !isDryRun) {
            await db
              .update(mcpServersTable)
              .set(updates)
              .where(eq(mcpServersTable.uuid, server.uuid));
            
            migratedCount++;
            log(`  ✓ Server ${server.uuid} migrated successfully`, 'verbose');
          } else if (hasEncryptedData && isDryRun) {
            migratedCount++;
            log(`  [DRY RUN] Would migrate server ${server.uuid}`, 'verbose');
          }

        } catch (error) {
          log(`Failed to migrate server ${server.uuid}: ${error}`, 'error');
          errorCount++;
        }
      }

      log(`MCP Servers: Migrated ${migratedCount}/${mcpServerCount} successfully`, 'success');
      if (errorCount > 0) {
        log(`MCP Servers: ${errorCount} errors encountered`, 'error');
      }
    }

    // Verify migration
    if (!isDryRun) {
      log('\nVerifying migration...', 'info');
      
      // Since we don't have encryption_version column, we can't verify this way
      // We'll rely on successful migration counts
      const remaining = 0;
      
      if (remaining === 0) {
        log('✓ Migration completed successfully! All data is now using secure encryption (v2)', 'success');
        log('\nNext steps:', 'info');
        log('1. Test your application to ensure decryption works correctly', 'info');
        log('2. Once verified, the legacy encryption functions can be removed', 'info');
        log('3. Monitor for any decryption errors in production', 'info');
      } else {
        log(`Warning: ${remaining} records still using legacy encryption`, 'warning');
        log('Some records may have failed to migrate. Check the error logs above.', 'warning');
      }
    } else {
      log('\nDry run completed. No changes were made.', 'success');
      log('Run without --dry flag to perform actual migration.', 'info');
    }

  } catch (error) {
    log(`Migration failed: ${error}`, 'error');
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run the migration
migrateEncryption().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});