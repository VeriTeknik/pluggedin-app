import { config } from 'dotenv';
import pg from 'pg';

const { Pool } = pg;

// Load environment variables from .env files
config({ path: '.env.local' });
config({ path: '.env' });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is not defined in environment variables or .env files.');
  process.exit(1);
}

async function fixMigration() {
  const pool = new Pool({
    connectionString: databaseUrl
  });

  try {
    console.log('Connecting to database...');
    
    // Check if the __drizzle_migrations table exists
    const checkTableResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '__drizzle_migrations'
      );
    `);
    
    const tableExists = checkTableResult.rows[0].exists;
    
    if (!tableExists) {
      console.log('Creating __drizzle_migrations table...');
      await pool.query(`
        CREATE TABLE "__drizzle_migrations" (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at timestamp with time zone DEFAULT now()
        );
      `);
    }
    
    // Check if the migration is already in the table
    const checkMigrationResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM __drizzle_migrations 
        WHERE hash = '0025_busy_shen'
      );
    `);
    
    const migrationExists = checkMigrationResult.rows[0].exists;
    
    if (migrationExists) {
      console.log('Migration 0025_busy_shen is already marked as applied.');
    } else {
      // Insert the migration record
      console.log('Marking migration 0025_busy_shen as applied...');
      await pool.query(`
        INSERT INTO __drizzle_migrations (hash)
        VALUES ('0025_busy_shen');
      `);
      console.log('Migration 0025_busy_shen has been marked as applied.');
    }
    
    // Verify the release_notes table exists
    const checkReleaseNotesResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'release_notes'
      );
    `);
    
    const releaseNotesExists = checkReleaseNotesResult.rows[0].exists;
    
    if (releaseNotesExists) {
      console.log('The release_notes table exists in the database.');
    } else {
      console.log('WARNING: The release_notes table does not exist in the database.');
      console.log('This script marks the migration as applied but does not create the table.');
      console.log('If you need the table, you should create it manually.');
    }

  } catch (error) {
    console.error('Error fixing migration:', error);
    process.exit(1);
  } finally {
    console.log('Closing database connection...');
    await pool.end();
    console.log('Database connection closed.');
  }
}

fixMigration();
