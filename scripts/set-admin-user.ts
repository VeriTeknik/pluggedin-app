#!/usr/bin/env node

/**
 * Script to grant or revoke admin privileges for users
 * Run with: npx tsx scripts/set-admin-user.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import path from 'path';
import readline from 'readline';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const db = drizzle(pool);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  try {
    console.log('🔐 Admin User Management Script\n');

    // Get action
    const action = await question('Do you want to (grant/revoke) admin privileges? ');
    if (!['grant', 'revoke'].includes(action.toLowerCase())) {
      console.error('❌ Invalid action. Please enter "grant" or "revoke".');
      process.exit(1);
    }

    // Get user email
    const email = await question('Enter the user email address: ');
    if (!email || !email.includes('@')) {
      console.error('❌ Invalid email address.');
      process.exit(1);
    }

    // Find the user
    const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user.length) {
      console.error(`❌ User with email "${email}" not found.`);
      process.exit(1);
    }

    const targetUser = user[0];
    const isGranting = action.toLowerCase() === 'grant';

    // Confirm action
    console.log(`\n📋 Action Summary:`);
    console.log(`   User: ${targetUser.name} (${targetUser.email})`);
    console.log(`   Current admin status: ${targetUser.is_admin ? 'Admin' : 'Regular User'}`);
    console.log(`   New admin status: ${isGranting ? 'Admin' : 'Regular User'}`);

    if (targetUser.is_admin === isGranting) {
      console.log(`\n⚠️  User already has ${isGranting ? 'admin' : 'regular'} privileges.`);
      process.exit(0);
    }

    const confirm = await question('\nProceed with this change? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Operation cancelled.');
      process.exit(0);
    }

    // Update the user
    await db.update(users)
      .set({
        is_admin: isGranting,
        // Optionally set 2FA requirement for new admins
        requires_2fa: isGranting ? true : targetUser.requires_2fa
      })
      .where(eq(users.id, targetUser.id));

    console.log(`\n✅ Successfully ${isGranting ? 'granted' : 'revoked'} admin privileges for ${targetUser.email}`);

    if (isGranting) {
      console.log('\n🔒 Security Recommendations:');
      console.log('   1. Enable 2FA for this admin account');
      console.log('   2. Review audit logs regularly');
      console.log('   3. Use strong, unique passwords');
      console.log('   4. Limit admin access to trusted users only');
    }

    // List all current admins
    const allAdmins = await db.select({
      email: users.email,
      name: users.name,
      requires_2fa: users.requires_2fa
    })
    .from(users)
    .where(eq(users.is_admin, true));

    console.log(`\n👥 Current Admin Users (${allAdmins.length}):`);
    allAdmins.forEach(admin => {
      console.log(`   - ${admin.name} (${admin.email}) ${admin.requires_2fa ? '[2FA ✓]' : '[2FA ✗]'}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    rl.close();
    await pool.end();
  }
}

// Run the script
main();