const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * Generate a random UUID v4
 * @returns {string} UUID
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Hash password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(password) {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Check if an admin user already exists
 * @param {string} databaseUrl - PostgreSQL connection URL
 * @returns {Promise<Object>} Result with exists flag and count
 */
async function adminExists(databaseUrl) {
  try {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();

    const result = await client.query(
      'SELECT COUNT(*) as count, email FROM users WHERE is_admin = true GROUP BY email LIMIT 1'
    );

    await client.end();

    if (result.rows.length > 0) {
      return {
        exists: true,
        count: parseInt(result.rows[0].count),
        email: result.rows[0].email,
      };
    }

    return {
      exists: false,
      count: 0,
    };
  } catch (error) {
    throw new Error(`Failed to check for admin users: ${error.message}`);
  }
}

/**
 * Create admin user with default project and profile
 * @param {string} databaseUrl - PostgreSQL connection URL
 * @param {string} email - Admin email
 * @param {string} password - Admin password (will be hashed)
 * @returns {Promise<Object>} Creation result with user, project, and profile details
 */
async function createAdminUser(databaseUrl, email, password) {
  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    await client.query('BEGIN');

    // Check if user already exists
    const existingUser = await client.query(
      'SELECT id, email, is_admin FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      await client.end();

      return {
        success: false,
        message: `User with email '${email}' already exists`,
        existing: true,
        user: existingUser.rows[0],
      };
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Generate IDs
    const userId = generateUUID();
    const projectUuid = generateUUID();
    const profileUuid = generateUUID();

    // Create user
    const userResult = await client.query(`
      INSERT INTO users (
        id,
        email,
        password,
        name,
        email_verified,
        is_admin,
        is_public,
        language,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, NOW(), true, true, 'en', NOW(), NOW())
      RETURNING id, email, name, is_admin, created_at
    `, [userId, email, hashedPassword, email.split('@')[0]]);

    const user = userResult.rows[0];

    // Create default project
    const projectResult = await client.query(`
      INSERT INTO projects (
        uuid,
        user_id,
        name,
        created_at,
        active_profile_uuid
      ) VALUES ($1, $2, $3, NOW(), $4)
      RETURNING uuid, name, created_at
    `, [projectUuid, userId, 'Default Project', profileUuid]);

    const project = projectResult.rows[0];

    // Create default profile
    const profileResult = await client.query(`
      INSERT INTO profiles (
        uuid,
        project_uuid,
        name,
        created_at,
        is_default
      ) VALUES ($1, $2, $3, NOW(), true)
      RETURNING uuid, name, created_at
    `, [profileUuid, projectUuid, 'Default Profile']);

    const profile = profileResult.rows[0];

    await client.query('COMMIT');
    await client.end();

    console.log('✅ Admin user created successfully');
    console.log(`   Email: ${email}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Project: ${project.name} (${projectUuid})`);
    console.log(`   Profile: ${profile.name} (${profileUuid})`);

    return {
      success: true,
      message: 'Admin user created successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        is_admin: user.is_admin,
        created_at: user.created_at,
      },
      project: {
        uuid: project.uuid,
        name: project.name,
        created_at: project.created_at,
      },
      profile: {
        uuid: profile.uuid,
        name: profile.name,
        created_at: profile.created_at,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    await client.end();

    console.error('❌ Failed to create admin user:', error.message);

    return {
      success: false,
      message: `Failed to create admin user: ${error.message}`,
      error: error.message,
    };
  }
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with strength score and feedback
 */
function validatePassword(password) {
  const result = {
    isValid: false,
    strength: 0, // 0-4 scale
    feedback: [],
  };

  if (!password) {
    result.feedback.push('Password is required');
    return result;
  }

  if (password.length < 8) {
    result.feedback.push('Password must be at least 8 characters');
    return result;
  }

  result.isValid = true;
  result.strength = 1; // Weak

  // Check for various character types
  if (password.length >= 12) result.strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) result.strength++;
  if (/\d/.test(password)) result.strength++;
  if (/[^a-zA-Z0-9]/.test(password)) result.strength++;

  // Cap at 4
  result.strength = Math.min(result.strength, 4);

  // Add feedback
  if (result.strength === 1) {
    result.feedback.push('Weak password. Add uppercase, numbers, and symbols.');
  } else if (result.strength === 2) {
    result.feedback.push('Fair password. Consider adding more character types.');
  } else if (result.strength === 3) {
    result.feedback.push('Good password.');
  } else if (result.strength === 4) {
    result.feedback.push('Strong password!');
  }

  return result;
}

module.exports = {
  createAdminUser,
  adminExists,
  hashPassword,
  isValidEmail,
  validatePassword,
  generateUUID,
};
