import { config } from 'dotenv';
import fs from 'fs'; // Import full fs module
import path from 'path'; // Import full path module
import pg from 'pg';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // Use path.dirname

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

// Function to find the latest migration file
function getLatestMigrationFile() {
  const drizzleDir = path.join(__dirname, '../drizzle');
  try {
    const files = fs.readdirSync(drizzleDir);
    const sqlFiles = files
      .filter(file => file.endsWith('.sql'))
      .sort() // Sort alphabetically/numerically based on filename prefix
      .reverse(); // Get the latest first

    if (sqlFiles.length === 0) {
      console.error('No SQL migration files found in drizzle directory.');
      return null;
    }
    return sqlFiles[0]; // Return the latest migration filename
  } catch (error) {
    console.error('Error reading drizzle directory:', error);
    return null;
  }
}


const databaseUrl = getDatabaseUrl();
const latestMigrationFileName = getLatestMigrationFile();

if (!databaseUrl) {
  console.error('DATABASE_URL is not defined in environment variables or .env files.');
  process.exit(1);
}

if (!latestMigrationFileName) {
  console.error('Could not determine the latest migration file.');
  process.exit(1);
}

async function applyLatestMigration() {
  const pool = new Pool({
    connectionString: databaseUrl
  });

  try {
    console.log('Connecting to database...');

    // Construct the full path to the latest migration file
    const migrationPath = path.join(__dirname, '../drizzle', latestMigrationFileName);

    console.log(`Reading migration file: ${migrationPath}`);
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    console.log(`Applying latest migration: ${latestMigrationFileName}`);

    // Execute the SQL
    await pool.query(migrationSql);

    console.log(`Migration ${latestMigrationFileName} applied successfully!`);

    // Drizzle Kit's migrate command handles the __drizzle_migrations table automatically.
    // Manual insertion is generally not needed when using a script like this just for applying SQL.

  } catch (error) {
    console.error(`Error applying migration ${latestMigrationFileName}:`, error);
    // Keep the idempotency check if needed for specific errors, otherwise fail
    if (error.message.includes('already exists') || error.message.includes('duplicate key value violates unique constraint')) {
       console.log(`Ignoring error as change likely already applied (idempotency check).`);
       // Allow script to finish successfully if it's an idempotency issue
    } else {
       process.exit(1); // Exit with error for other issues
    }
  } finally {
    console.log('Closing database connection...');
    await pool.end();
    console.log('Database connection closed.');
  }
}

applyLatestMigration();
