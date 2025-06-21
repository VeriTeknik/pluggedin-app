/**
 * Script to encrypt existing MCP server data
 * Run with: tsx scripts/encrypt-existing-mcp-data.ts
 */

import { eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { mcpServersTable } from '../db/schema';
import { encryptServerData } from '../lib/encryption';

async function encryptExistingData() {
  console.log('Starting encryption of existing MCP server data...');
  
  try {
    // Get all servers that haven't been encrypted yet
    const servers = await db
      .select()
      .from(mcpServersTable)
      .where(isNull(mcpServersTable.command_encrypted));
    
    console.log(`Found ${servers.length} servers to encrypt`);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Process servers in batches
    const batchSize = 10;
    for (let i = 0; i < servers.length; i += batchSize) {
      const batch = servers.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (server) => {
          try {
            // Only encrypt if there's data to encrypt
            const hasDataToEncrypt = 
              server.command || 
              (server.args && server.args.length > 0) || 
              (server.env && Object.keys(server.env).length > 0) || 
              server.url;
            
            if (!hasDataToEncrypt) {
              console.log(`Server ${server.uuid} has no data to encrypt, skipping`);
              return;
            }
            
            // Encrypt the server data
            const encryptedData = encryptServerData(server, server.profile_uuid);
            
            // Update the database with encrypted data
            await db
              .update(mcpServersTable)
              .set({
                command_encrypted: encryptedData.command_encrypted,
                args_encrypted: encryptedData.args_encrypted,
                env_encrypted: encryptedData.env_encrypted,
                url_encrypted: encryptedData.url_encrypted,
              })
              .where(eq(mcpServersTable.uuid, server.uuid));
            
            successCount++;
            console.log(`✓ Encrypted server ${server.uuid} (${server.name})`);
          } catch (error) {
            errorCount++;
            console.error(`✗ Failed to encrypt server ${server.uuid}:`, error);
          }
        })
      );
      
      console.log(`Progress: ${i + batch.length}/${servers.length}`);
    }
    
    console.log('\nEncryption complete!');
    console.log(`Success: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    
    // After successful encryption, we could remove the unencrypted columns
    // But for safety, this should be done in a separate migration after verification
    console.log('\nNote: Original unencrypted columns are still present.');
    console.log('Run a separate migration to remove them after verifying encryption works correctly.');
    
  } catch (error) {
    console.error('Fatal error during encryption:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the encryption
encryptExistingData();