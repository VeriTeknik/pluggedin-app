import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env files
config({ path: '.env.local' });
config({ path: '.env' });

// Get DATABASE_URL from environment
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is not defined in environment variables or .env files.');
  process.exit(1);
}

async function applyFixAuthTables() {
  const pool = new Pool({
    connectionString: databaseUrl
  });

  try {
    console.log('Connecting to database...');

    // Construct the full path to the fix-auth-tables.sql file
    const sqlFilePath = path.join(__dirname, '../fix-auth-tables.sql');

    console.log(`Reading SQL file: ${sqlFilePath}`);
    const sql = fs.readFileSync(sqlFilePath, 'utf8');

    console.log('Applying fix-auth-tables.sql...');

    // Execute the SQL
    await pool.query(sql);

    console.log('fix-auth-tables.sql applied successfully!');

  } catch (error) {
    console.error('Error applying fix-auth-tables.sql:', error);
    // Ignore errors related to objects already existing
    if (error.message.includes('already exists') || error.message.includes('duplicate key value violates unique constraint')) {
      console.log('Ignoring error as change likely already applied (idempotency check).');
    } else {
      process.exit(1); // Exit with error for other issues
    }
  } finally {
    console.log('Closing database connection...');
    await pool.end();
    console.log('Database connection closed.');
  }
}

applyFixAuthTables();
