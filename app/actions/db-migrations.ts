'use server';

import { sql } from 'drizzle-orm';

import { db } from '@/db';

/**
 * Server action to add the missing active_profile_uuid foreign key constraint
 */
export async function addMissingForeignKeyConstraint() {
  try {
    // Check if the constraint already exists
    const constraintExists = await db.execute(sql`
      SELECT 1 FROM pg_constraint
      WHERE conname = 'projects_active_profile_uuid_profiles_uuid_fk'
      LIMIT 1
    `);

    if (constraintExists.rows.length > 0) {
      return { 
        success: true, 
        message: 'Foreign key constraint already exists.' 
      };
    }

    // Add the foreign key constraint
    await db.execute(sql`
      ALTER TABLE "projects" 
      ADD CONSTRAINT "projects_active_profile_uuid_profiles_uuid_fk" 
      FOREIGN KEY ("active_profile_uuid") 
      REFERENCES "profiles"("uuid") 
      ON DELETE SET NULL
    `);

    return { 
      success: true, 
      message: 'Foreign key constraint added successfully.' 
    };
  } catch (error) {
    console.error('Error adding foreign key constraint:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : String(error) 
    };
  }
} 