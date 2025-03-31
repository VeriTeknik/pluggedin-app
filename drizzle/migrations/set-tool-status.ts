// migrations/set-tool-status.ts
import { sql } from 'drizzle-orm';

// Adjust the import paths based on your project structure
// Using relative paths without extensions for standard ES Module resolution
import { db } from '../../db/index'; 
import { ToggleStatus, toolsTable } from '../../db/schema';

export async function setToolStatus() {
  console.log('Starting migration: Set default status for existing tools...');
  try {
    // Update all tools where status is currently NULL to ACTIVE
    const result = await db.execute(sql`
      UPDATE ${toolsTable}
      SET status = ${ToggleStatus.ACTIVE}
      WHERE status IS NULL
    `);

    // Drizzle's execute might not return affected rows count directly in all drivers.
    // Log a general success message. Check your specific driver if count is needed.
    console.log('Successfully checked and updated tool statuses where necessary.');

  } catch (error) {
    console.error('Error updating tool status:', error);
    throw error; // Re-throw the error to indicate failure
  }
}

// Allow running this script directly using node
// Check if the script is the main module being run
if (require.main === module) {
  setToolStatus()
    .then(() => {
      console.log('Migration script finished successfully.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

// Export the function in case it needs to be called programmatically elsewhere
export default setToolStatus;
