const { exec } = require('child_process');
const { promisify } = require('util');
const { Client } = require('pg');
const path = require('path');

const execAsync = promisify(exec);

/**
 * Test database connection
 * @param {string} databaseUrl - PostgreSQL connection URL
 * @returns {Promise<Object>} Connection test result
 */
async function testDatabaseConnection(databaseUrl) {
  try {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();

    // Test with a simple query
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    await client.end();

    return {
      success: true,
      message: 'Database connection successful',
      serverTime: result.rows[0].current_time,
      version: result.rows[0].pg_version,
    };
  } catch (error) {
    return {
      success: false,
      message: `Database connection failed: ${error.message}`,
      error: error.message,
    };
  }
}

/**
 * Check if database exists
 * @param {string} databaseUrl - PostgreSQL connection URL
 * @returns {Promise<boolean>} True if database exists
 */
async function databaseExists(databaseUrl) {
  try {
    // Parse database URL to get database name
    const url = new URL(databaseUrl);
    const dbName = url.pathname.slice(1); // Remove leading slash

    // Connect to postgres database to check if target database exists
    const adminUrl = databaseUrl.replace(`/${dbName}`, '/postgres');
    const client = new Client({ connectionString: adminUrl });
    await client.connect();

    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );
    await client.end();

    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking database existence:', error.message);
    return false;
  }
}

/**
 * Create database if it doesn't exist
 * @param {string} databaseUrl - PostgreSQL connection URL
 * @returns {Promise<Object>} Creation result
 */
async function createDatabase(databaseUrl) {
  try {
    // Parse database URL
    const url = new URL(databaseUrl);
    const dbName = url.pathname.slice(1);

    // Connect to postgres database
    const adminUrl = databaseUrl.replace(`/${dbName}`, '/postgres');
    const client = new Client({ connectionString: adminUrl });
    await client.connect();

    // Check if database already exists
    const checkResult = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );

    if (checkResult.rows.length > 0) {
      await client.end();
      return {
        success: true,
        message: `Database '${dbName}' already exists`,
        created: false,
      };
    }

    // Create database
    await client.query(`CREATE DATABASE "${dbName}"`);
    await client.end();

    return {
      success: true,
      message: `Database '${dbName}' created successfully`,
      created: true,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to create database: ${error.message}`,
      error: error.message,
    };
  }
}

/**
 * Run database migrations using Drizzle Kit
 * @param {string} databaseUrl - PostgreSQL connection URL
 * @returns {Promise<Object>} Migration result with output
 */
async function runMigrations(databaseUrl) {
  try {
    // Set DATABASE_URL environment variable for the migration process
    const env = { ...process.env, DATABASE_URL: databaseUrl };

    // Change to parent directory (where package.json and drizzle config are)
    const projectRoot = path.join(__dirname, '../..');

    console.log('🔄 Running database migrations...');
    console.log(`📁 Project root: ${projectRoot}`);

    // Run pnpm db:migrate
    const { stdout, stderr } = await execAsync('pnpm db:migrate', {
      cwd: projectRoot,
      env: env,
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer for output
    });

    const output = stdout + (stderr || '');
    console.log('Migration output:', output);

    // Check if migrations were successful
    if (output.includes('applied successfully') || output.includes('No schema changes')) {
      return {
        success: true,
        message: 'Database migrations completed successfully',
        output: output,
      };
    }

    // If no success indicator but also no error, assume success
    return {
      success: true,
      message: 'Database migrations completed',
      output: output,
    };
  } catch (error) {
    console.error('Migration error:', error);
    return {
      success: false,
      message: `Migration failed: ${error.message}`,
      error: error.message,
      output: error.stdout || error.stderr || '',
    };
  }
}

/**
 * Get migration status
 * @param {string} databaseUrl - PostgreSQL connection URL
 * @returns {Promise<Object>} Migration status
 */
async function getMigrationStatus(databaseUrl) {
  try {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();

    // Check if drizzle migrations table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'drizzle'
        AND table_name = '__drizzle_migrations'
      ) as exists
    `);

    if (!tableCheck.rows[0].exists) {
      await client.end();
      return {
        success: true,
        hasMigrations: false,
        count: 0,
        message: 'No migrations have been run yet',
      };
    }

    // Get migration count
    const migrationCount = await client.query(`
      SELECT COUNT(*) as count
      FROM drizzle.__drizzle_migrations
    `);

    // Get latest migration
    const latestMigration = await client.query(`
      SELECT *
      FROM drizzle.__drizzle_migrations
      ORDER BY created_at DESC
      LIMIT 1
    `);

    await client.end();

    return {
      success: true,
      hasMigrations: true,
      count: parseInt(migrationCount.rows[0].count),
      latest: latestMigration.rows[0],
      message: `${migrationCount.rows[0].count} migrations applied`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to get migration status: ${error.message}`,
      error: error.message,
    };
  }
}

/**
 * Complete database setup: test connection, create database if needed, run migrations
 * @param {string} databaseUrl - PostgreSQL connection URL
 * @returns {Promise<Object>} Setup result with all steps
 */
async function setupDatabase(databaseUrl) {
  const results = {
    steps: [],
    success: false,
    message: '',
  };

  try {
    // Step 1: Test connection to target database directly
    // (Docker setup pre-creates the database, so we don't need to connect to postgres database)
    console.log('📡 Testing database connection...');
    const connectionTest = await testDatabaseConnection(databaseUrl);
    results.steps.push({
      name: 'connection_test',
      ...connectionTest,
    });

    if (!connectionTest.success) {
      results.message = 'Database connection failed. Ensure PostgreSQL is running and accessible.';
      return results;
    }

    console.log('✅ Database connection successful!');

    // Step 2: Run migrations
    console.log('⚡ Running database migrations...');
    const migrationResult = await runMigrations(databaseUrl);
    results.steps.push({
      name: 'migrations',
      ...migrationResult,
    });

    if (!migrationResult.success) {
      results.message = 'Database migrations failed';
      return results;
    }

    // Step 3: Verify migrations
    console.log('✅ Verifying migrations...');
    const statusCheck = await getMigrationStatus(databaseUrl);
    results.steps.push({
      name: 'migration_verification',
      ...statusCheck,
    });

    results.success = true;
    results.message = 'Database setup completed successfully';

    return results;
  } catch (error) {
    results.success = false;
    results.message = `Database setup failed: ${error.message}`;
    results.error = error.message;
    return results;
  }
}

module.exports = {
  testDatabaseConnection,
  databaseExists,
  createDatabase,
  runMigrations,
  getMigrationStatus,
  setupDatabase,
};
