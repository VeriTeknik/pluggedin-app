import 'dotenv/config';
import pg from 'pg';
import { join } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not defined in environment variables');
  process.exit(1);
}

async function applyMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    console.log('Connecting to database...');
    
    // Read migration file
    const migrationPath = join(__dirname, '../drizzle/migrations/add_password_reset_tokens.sql');
    const migrationSql = readFileSync(migrationPath, 'utf8');
    
    console.log('Applying migration: add_password_reset_tokens.sql');
    
    // Execute the SQL
    await pool.query(migrationSql);
    
    console.log('Password reset tokens migration applied successfully!');
  } catch (error) {
    console.error('Error applying migration:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyMigration(); 