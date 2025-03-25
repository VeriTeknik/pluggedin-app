import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
config({ path: '.env.local' });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not defined in .env.local');
  process.exit(1);
}

async function applyMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    console.log('Connecting to database...');
    
    // Read migration file
    const migrationPath = join(__dirname, '../drizzle/migrations/add_password_field.sql');
    const migrationSql = readFileSync(migrationPath, 'utf8');
    
    console.log('Applying migration: add_password_field.sql');
    
    // Execute the SQL
    await pool.query(migrationSql);
    
    console.log('Migration applied successfully!');
  } catch (error) {
    console.error('Error applying migration:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyMigration(); 