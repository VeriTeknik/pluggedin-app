import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env files first
config({ path: '.env.local' });
config({ path: '.env' });

// Function to read DATABASE_URL from .env files if not set
function getDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  try {
    const envFiles = ['.env.local', '.env'];
    for (const file of envFiles) {
      try {
        const content = readFileSync(file, 'utf-8');
        const match = content.match(/DATABASE_URL="?([^"]+)"?/);
        if (match && match[1]) {
          console.log(`Found DATABASE_URL in ${file}`);
          return match[1];
        }
      } catch (e) {
        // Ignore if file doesn't exist
      }
    }
  } catch (e) {
    console.error('Error reading .env files:', e);
  }
  return null;
}

const databaseUrl = getDatabaseUrl();

if (!databaseUrl) {
  console.error('DATABASE_URL is not defined in environment variables or .env files.');
  process.exit(1);
}

// Define the specific migration file to apply
const MIGRATION_FILE_NAME = '0018_wakeful_rocket_raccoon.sql';

async function applySpecificMigration() {
  const pool = new Pool({
    connectionString: databaseUrl
  });
  
  try {
    console.log('Connecting to database...');
    
    // Construct the full path to the migration file
    const migrationPath = join(__dirname, '../drizzle', MIGRATION_FILE_NAME); // Adjusted path assuming script is in /scripts and migrations in /drizzle
    
    console.log(`Reading migration file: ${migrationPath}`);
    const migrationSql = readFileSync(migrationPath, 'utf8');
    
    console.log(`Applying specific migration: ${MIGRATION_FILE_NAME}`);
    
    // Execute the SQL
    await pool.query(migrationSql);
    
    console.log(`Migration ${MIGRATION_FILE_NAME} applied successfully!`);
    
    // Optional: Manually insert into __drizzle_migrations if needed, but be cautious
    // await pool.query("INSERT INTO drizzle.__drizzle_migrations (migration_hash, created_at) VALUES ($1, $2)", [MIGRATION_FILE_NAME, BigInt(Date.now())]);
    // console.log(`Recorded ${MIGRATION_FILE_NAME} in __drizzle_migrations.`);

  } catch (error) {
    console.error(`Error applying migration ${MIGRATION_FILE_NAME}:`, error);
    // Check if the error is because the enum values already exist (idempotency)
    if (error.message.includes('already exists')) {
       console.log(`Ignoring error as enum value likely already exists.`);
    } else {
       process.exit(1);
    }
  } finally {
    console.log('Closing database connection...');
    await pool.end();
    console.log('Database connection closed.');
  }
}

applySpecificMigration();
