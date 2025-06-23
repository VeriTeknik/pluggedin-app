/**
 * Script to clear unencrypted data from MCP servers that have been encrypted
 * Run with: tsx scripts/clear-unencrypted-data.ts
 */

import { db } from '../db';
import { mcpServersTable } from '../db/schema';
import { isNotNull } from 'drizzle-orm';

async function clearUnencryptedData() {
  console.log('Starting to clear unencrypted data from encrypted servers...');
  
  try {
    // Update all servers that have encrypted data to remove unencrypted fields
    const result = await db
      .update(mcpServersTable)
      .set({
        command: null,
        args: null,
        env: null,
        url: null,
      })
      .where(isNotNull(mcpServersTable.command_encrypted));
    
    console.log('Successfully cleared unencrypted data from encrypted servers');
    
  } catch (error) {
    console.error('Error clearing unencrypted data:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the script
clearUnencryptedData();