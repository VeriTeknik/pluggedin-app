import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

async function checkMigrations() {
  try {
    // Check drizzle migrations table
    const migrations = await db.execute(sql`
      SELECT * FROM drizzle.__drizzle_migrations
      ORDER BY created_at DESC
      LIMIT 10
    `);
    console.log('Last 10 migrations:');
    console.log(migrations.rows);

    // Check if email tables exist
    const tables = await db.execute(sql`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename IN ('user_email_preferences', 'email_tracking', 'scheduled_emails')
    `);
    console.log('\nEmail tables found:');
    console.log(tables.rows);

  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

checkMigrations();