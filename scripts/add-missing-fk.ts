#!/usr/bin/env node

import { sql } from 'drizzle-orm';

import { db } from '@/db';

async function addForeignKeyConstraint() {
  console.log('Checking for missing foreign key constraint...');
  
  try {
    // Check if the constraint already exists
    const constraintExists = await db.execute(sql`
      SELECT 1 FROM pg_constraint
      WHERE conname = 'projects_active_profile_uuid_profiles_uuid_fk'
      LIMIT 1
    `);

    if (constraintExists.rows.length > 0) {
      console.log('Foreign key constraint already exists.');
      return;
    }

    console.log('Adding missing foreign key constraint...');

    // Add the foreign key constraint
    await db.execute(sql`
      ALTER TABLE "projects" 
      ADD CONSTRAINT "projects_active_profile_uuid_profiles_uuid_fk" 
      FOREIGN KEY ("active_profile_uuid") 
      REFERENCES "profiles"("uuid") 
      ON DELETE SET NULL
    `);

    console.log('Foreign key constraint added successfully!');
  } catch (error) {
    console.error('Error adding foreign key constraint:', error);
  }
}

// Execute the function
addForeignKeyConstraint()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  }); 