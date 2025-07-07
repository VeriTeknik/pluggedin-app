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

async function applyFixJwtSession() {
  const pool = new Pool({
    connectionString: databaseUrl
  });

  try {
    console.log('Connecting to database...');

    // Construct the full path to the fix-jwt-session.sql file
    const sqlFilePath = path.join(__dirname, '../fix-jwt-session.sql');

    console.log(`Reading SQL file: ${sqlFilePath}`);
    const sql = fs.readFileSync(sqlFilePath, 'utf8');

    console.log('Applying fix-jwt-session.sql...');

    // Execute the SQL
    const result = await pool.query(sql);

    console.log('fix-jwt-session.sql applied successfully!');
    
    // Display the result of the verification query
    if (result.length > 0 && result[result.length - 1].rows) {
      console.log('Username column verification:');
      console.table(result[result.length - 1].rows);
    }

  } catch (error) {
    console.error('Error applying fix-jwt-session.sql:', error);
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

applyFixJwtSession();
