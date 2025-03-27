#!/usr/bin/env tsx

/**
 * Script to update search cache metrics
 * Run this periodically (e.g., via cron) to keep metrics in search results up to date
 * 
 * Example cron entry (every hour):
 * 0 * * * * cd /path/to/app && pnpm tsx ./scripts/update-metrics.ts
 */

import { updateSearchCacheMetrics } from '../app/actions/mcp-server-metrics';

async function main() {
  console.log('Updating search cache metrics...');
  
  try {
    const result = await updateSearchCacheMetrics();
    
    if (result.success) {
      console.log('✅ Successfully updated search cache metrics');
    } else {
      console.error('❌ Failed to update search cache metrics:', result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error updating search cache metrics:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 