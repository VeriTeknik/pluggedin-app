#!/usr/bin/env tsx
/**
 * Setup Email Consents for Existing Users
 *
 * This script sets up default email preferences for all existing users
 * who don't have preference records yet.
 *
 * Usage:
 *   pnpm setup:email-consents          - Apply defaults to all users
 *   pnpm setup:email-consents --dry    - Preview without changes
 *   pnpm setup:email-consents --marketing - Include marketing emails (optional)
 */

import { config } from 'dotenv';
import path from 'path';
import pg from 'pg';

// Load environment variables first
config({ path: path.resolve(process.cwd(), '.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set in .env file');
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry') || args.includes('--dry-run');
const includeMarketing = args.includes('--marketing');

async function setupEmailConsents() {
  console.log('📧 Setting up email consents for existing users...\n');

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  if (includeMarketing) {
    console.log('⚠️  Marketing emails will be ENABLED by default');
    console.log('   (Make sure this complies with your local regulations)\n');
  }

  // Create database connection
  const client = new pg.Client({
    connectionString: DATABASE_URL,
  });

  await client.connect();

  try {
    // Step 1: Get all users
    console.log('1️⃣  Fetching all users...');
    const allUsersResult = await client.query(`
      SELECT id, email, name, created_at
      FROM users
      ORDER BY created_at DESC
    `);
    const allUsers = allUsersResult.rows;

    console.log(`   Found ${allUsers.length} total users\n`);

    // Step 2: Get users who already have preferences
    console.log('2️⃣  Checking existing preferences...');
    const existingPreferencesResult = await client.query(`
      SELECT user_id
      FROM user_email_preferences
    `);
    const usersWithPreferences = new Set(existingPreferencesResult.rows.map(row => row.user_id));
    console.log(`   Found ${usersWithPreferences.size} users with preferences\n`);

    // Step 3: Identify users without preferences
    const usersWithoutPreferences = allUsers.filter(
      user => !usersWithPreferences.has(user.id)
    );

    console.log(`3️⃣  Found ${usersWithoutPreferences.length} users WITHOUT preferences\n`);

    if (usersWithoutPreferences.length === 0) {
      console.log('✅ All users already have email preferences set!');
      await client.end();
      return;
    }

    // Step 4: Show sample of users to be updated
    console.log('4️⃣  Users to be updated (sample):');
    const sampleSize = Math.min(5, usersWithoutPreferences.length);
    for (let i = 0; i < sampleSize; i++) {
      const user = usersWithoutPreferences[i];
      const createdDate = user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown';
      console.log(`   - ${user.email} (${user.name || 'No name'}) - Created: ${createdDate}`);
    }
    if (usersWithoutPreferences.length > sampleSize) {
      console.log(`   ... and ${usersWithoutPreferences.length - sampleSize} more\n`);
    } else {
      console.log('');
    }

    // Step 5: Prepare default preferences
    const defaultPreferences = {
      welcomeEmails: true,           // Opt-out (enabled by default)
      productUpdates: true,          // Opt-out (enabled by default)
      marketingEmails: includeMarketing, // Opt-in (disabled by default unless --marketing flag)
      adminNotifications: true,      // Enabled by default
      notificationSeverity: 'ALERT,CRITICAL',
    };

    console.log('5️⃣  Default preferences to be applied:');
    console.log(`   - Welcome Emails: ${defaultPreferences.welcomeEmails ? '✅' : '❌'}`);
    console.log(`   - Product Updates: ${defaultPreferences.productUpdates ? '✅' : '❌'}`);
    console.log(`   - Marketing Emails: ${defaultPreferences.marketingEmails ? '✅' : '❌'}`);
    console.log(`   - Admin Notifications: ${defaultPreferences.adminNotifications ? '✅' : '❌'}`);
    console.log(`   - Notification Severity: ${defaultPreferences.notificationSeverity}\n`);

    if (!isDryRun) {
      // Step 6: Apply preferences in batches
      console.log('6️⃣  Applying preferences...');
      const batchSize = 100;
      let processed = 0;

      for (let i = 0; i < usersWithoutPreferences.length; i += batchSize) {
        const batch = usersWithoutPreferences.slice(i, i + batchSize);

        // Build bulk insert query
        const values = batch.map((user, index) => {
          const baseIndex = index * 8;
          return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8})`;
        }).join(', ');

        const params = batch.flatMap(user => [
          user.id,
          defaultPreferences.welcomeEmails,
          defaultPreferences.productUpdates,
          defaultPreferences.marketingEmails,
          defaultPreferences.adminNotifications,
          defaultPreferences.notificationSeverity,
          new Date(),
          new Date(),
        ]);

        const query = `
          INSERT INTO user_email_preferences (
            user_id,
            welcome_emails,
            product_updates,
            marketing_emails,
            admin_notifications,
            notification_severity,
            created_at,
            updated_at
          )
          VALUES ${values}
          ON CONFLICT (user_id) DO NOTHING
        `;

        await client.query(query, params);

        processed += batch.length;
        const percentage = Math.round((processed / usersWithoutPreferences.length) * 100);
        console.log(`   Progress: ${processed}/${usersWithoutPreferences.length} (${percentage}%)`);
      }

      console.log('\n✅ Successfully set up email preferences!');
      console.log(`   Updated: ${usersWithoutPreferences.length} users`);
    } else {
      console.log('6️⃣  DRY RUN - No changes made');
      console.log(`   Would update: ${usersWithoutPreferences.length} users`);
    }

    // Step 7: Final summary
    console.log('\n📊 Summary:');
    console.log(`   Total users: ${allUsers.length}`);
    console.log(`   Already had preferences: ${usersWithPreferences.size}`);
    console.log(`   ${isDryRun ? 'Would update' : 'Updated'}: ${usersWithoutPreferences.length}`);

    if (!isDryRun) {
      console.log('\n💡 Users can manage their preferences at /settings');
      console.log('   All emails include unsubscribe links');
    } else {
      console.log('\n💡 Run without --dry flag to apply changes');
    }

  } catch (error) {
    console.error('\n❌ Error setting up email consents:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run the script
setupEmailConsents().catch(console.error);