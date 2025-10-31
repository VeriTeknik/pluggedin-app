const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const {
  generateAllSecrets,
  generateDatabasePassword,
  maskSecret,
  validateSecret,
} = require('./lib/secret-generator');
const {
  writeEnvFile,
  parseEnvFile,
  mergeWithDefaults,
} = require('./lib/env-generator');
const {
  isDocker,
  getEnvironmentDefaults,
  getProductionDefaults,
  getFeatureDefaults,
  getMCPDefaults,
} = require('./lib/docker-detector');
const {
  testDatabaseConnection,
  setupDatabase,
  getMigrationStatus,
} = require('./lib/db-migrator');
const {
  createAdminUser,
  adminExists,
  isValidEmail,
  validatePassword,
} = require('./lib/admin-creator');

const app = express();
const PORT = process.env.SETUP_PORT || 12006;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Store setup state (in-memory, reset on restart)
let setupState = {
  secrets: null,
  dbPassword: null,
};

// ============================================
// API ENDPOINTS
// ============================================

/**
 * GET /api/status
 * Get setup wizard status and environment info
 */
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    docker: isDocker(),
    platform: process.platform,
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/generate-secrets
 * Generate all required security secrets
 */
app.post('/api/generate-secrets', (req, res) => {
  try {
    const secrets = generateAllSecrets();
    const dbPassword = generateDatabasePassword();

    // Store in memory for later use
    setupState.secrets = secrets;
    setupState.dbPassword = dbPassword;

    // Return masked versions for display
    const masked = {};
    for (const [key, value] of Object.entries(secrets)) {
      masked[key] = {
        value: value,
        masked: maskSecret(value),
      };
    }

    res.json({
      success: true,
      secrets: masked,
      dbPassword: {
        value: dbPassword,
        masked: maskSecret(dbPassword),
      },
    });
  } catch (error) {
    console.error('Error generating secrets:', error);
    res.status(500).json({
      success: false,
      message: `Failed to generate secrets: ${error.message}`,
    });
  }
});

/**
 * POST /api/validate-config
 * Validate configuration before saving
 */
app.post('/api/validate-config', (req, res) => {
  try {
    const config = req.body;
    const errors = [];
    const warnings = [];

    // Validate required fields
    if (!config.adminEmail || !isValidEmail(config.adminEmail)) {
      errors.push('Valid admin email is required');
    }

    if (!config.adminPassword) {
      errors.push('Admin password is required');
    } else {
      const passwordValidation = validatePassword(config.adminPassword);
      if (!passwordValidation.isValid) {
        errors.push(...passwordValidation.feedback);
      } else if (passwordValidation.strength < 2) {
        warnings.push('Password strength is weak. Consider using a stronger password.');
      }
    }

    if (!config.DATABASE_URL) {
      errors.push('Database URL is required');
    }

    if (!config.NEXTAUTH_SECRET) {
      errors.push('NEXTAUTH_SECRET is required');
    } else {
      const secretValidation = validateSecret(config.NEXTAUTH_SECRET);
      if (!secretValidation.isValid) {
        errors.push(`NEXTAUTH_SECRET: ${secretValidation.message}`);
      }
    }

    // Validate URLs
    if (config.NEXTAUTH_URL) {
      try {
        new URL(config.NEXTAUTH_URL);
        if (config.NEXTAUTH_URL.startsWith('http:') && !config.NEXTAUTH_URL.includes('localhost')) {
          warnings.push('NEXTAUTH_URL uses HTTP instead of HTTPS for non-localhost');
        }
      } catch (e) {
        errors.push('NEXTAUTH_URL must be a valid URL');
      }
    }

    // Validate AI provider keys if provided
    if (config.ANTHROPIC_API_KEY && !config.ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
      warnings.push('Anthropic API key format looks unusual');
    }

    if (config.OPENAI_API_KEY && !config.OPENAI_API_KEY.startsWith('sk-')) {
      warnings.push('OpenAI API key format looks unusual');
    }

    res.json({
      success: errors.length === 0,
      valid: errors.length === 0,
      errors,
      warnings,
    });
  } catch (error) {
    console.error('Error validating config:', error);
    res.status(500).json({
      success: false,
      message: `Validation error: ${error.message}`,
    });
  }
});

/**
 * POST /api/test-database
 * Test database connection
 */
app.post('/api/test-database', async (req, res) => {
  try {
    const { databaseUrl } = req.body;

    if (!databaseUrl) {
      return res.status(400).json({
        success: false,
        message: 'Database URL is required',
      });
    }

    const result = await testDatabaseConnection(databaseUrl);
    res.json(result);
  } catch (error) {
    console.error('Error testing database:', error);
    res.status(500).json({
      success: false,
      message: `Database test failed: ${error.message}`,
    });
  }
});

/**
 * POST /api/setup-database
 * Complete database setup: create database, run migrations
 */
app.post('/api/setup-database', async (req, res) => {
  try {
    const { databaseUrl } = req.body;

    if (!databaseUrl) {
      return res.status(400).json({
        success: false,
        message: 'Database URL is required',
      });
    }

    console.log('🚀 Starting database setup...');
    const result = await setupDatabase(databaseUrl);

    res.json(result);
  } catch (error) {
    console.error('Error setting up database:', error);
    res.status(500).json({
      success: false,
      message: `Database setup failed: ${error.message}`,
      error: error.message,
    });
  }
});

/**
 * POST /api/create-admin
 * Create admin user
 */
app.post('/api/create-admin', async (req, res) => {
  try {
    const { databaseUrl, email, password } = req.body;

    if (!databaseUrl || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Database URL, email, and password are required',
      });
    }

    // Validate email
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
      });
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.feedback.join(', '),
      });
    }

    // Check if admin already exists
    const existing = await adminExists(databaseUrl);
    if (existing.exists) {
      return res.json({
        success: false,
        message: `Admin user already exists: ${existing.email}`,
        existing: true,
      });
    }

    // Create admin user
    const result = await createAdminUser(databaseUrl, email, password);
    res.json(result);
  } catch (error) {
    console.error('Error creating admin:', error);
    res.status(500).json({
      success: false,
      message: `Failed to create admin user: ${error.message}`,
    });
  }
});

/**
 * POST /api/import-env
 * Parse and validate uploaded .env file
 */
app.post('/api/import-env', async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        message: '.env file content is required',
      });
    }

    // Parse .env content
    const config = {};
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.trim().startsWith('#') || !line.trim()) {
        continue;
      }

      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();

        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        config[key] = value;
      }
    }

    // Validate imported config
    const warnings = [];
    const missing = [];

    // Check for required secrets
    if (!config.NEXTAUTH_SECRET) missing.push('NEXTAUTH_SECRET');
    if (!config.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY) missing.push('NEXT_SERVER_ACTIONS_ENCRYPTION_KEY');
    if (!config.DATABASE_URL) missing.push('DATABASE_URL');

    // Check for weak secrets
    if (config.NEXTAUTH_SECRET && config.NEXTAUTH_SECRET.length < 32) {
      warnings.push('NEXTAUTH_SECRET is shorter than recommended (32+ chars)');
    }

    res.json({
      success: true,
      config,
      warnings,
      missing,
      message: `Parsed ${Object.keys(config).length} configuration values`,
    });
  } catch (error) {
    console.error('Error importing .env:', error);
    res.status(500).json({
      success: false,
      message: `Failed to parse .env file: ${error.message}`,
    });
  }
});

/**
 * POST /api/save-env
 * Save configuration and write .env file
 */
app.post('/api/save-env', async (req, res) => {
  try {
    const userConfig = req.body;

    // Merge with defaults
    const dbPassword = setupState.dbPassword || generateDatabasePassword();
    const envDefaults = getEnvironmentDefaults(dbPassword);
    const prodDefaults = getProductionDefaults();
    const featureDefaults = getFeatureDefaults();
    const mcpDefaults = getMCPDefaults();

    const completeConfig = {
      ...envDefaults,
      ...prodDefaults,
      ...featureDefaults,
      ...mcpDefaults,
      ...setupState.secrets,
      ...userConfig,
    };

    // Write .env file to persistent storage
    const envPath = path.join(__dirname, '../config/.env');
    await writeEnvFile(completeConfig, envPath);

    // Also create symlink in app root for immediate use
    const appEnvPath = path.join(__dirname, '../.env');
    try {
      await fs.promises.symlink('/app/config/.env', appEnvPath);
    } catch (err) {
      // Symlink might already exist, ignore error
    }

    res.json({
      success: true,
      message: '.env file created successfully',
      path: envPath,
    });
  } catch (error) {
    console.error('Error saving .env:', error);
    res.status(500).json({
      success: false,
      message: `Failed to save .env file: ${error.message}`,
    });
  }
});

/**
 * POST /api/complete-setup
 * Complete setup and prepare for application restart
 */
app.post('/api/complete-setup', async (req, res) => {
  try {
    const { databaseUrl, adminEmail, adminPassword } = req.body;

    // Validate inputs
    if (!databaseUrl || !adminEmail || !adminPassword) {
      return res.status(400).json({
        success: false,
        message: 'Database URL, admin email, and password are required',
      });
    }

    console.log('🎯 Completing setup...');

    // Step 1: Setup database
    console.log('📊 Setting up database...');
    const dbResult = await setupDatabase(databaseUrl);
    if (!dbResult.success) {
      return res.json({
        success: false,
        message: 'Database setup failed',
        details: dbResult,
      });
    }

    // Step 2: Create admin user
    console.log('👤 Creating admin user...');
    const adminResult = await createAdminUser(databaseUrl, adminEmail, adminPassword);
    if (!adminResult.success) {
      return res.json({
        success: false,
        message: 'Admin user creation failed',
        details: adminResult,
      });
    }

    console.log('✅ Setup completed successfully!');

    res.json({
      success: true,
      message: 'Setup completed successfully',
      database: dbResult,
      admin: adminResult,
    });

    // Schedule exit after response is sent
    setTimeout(() => {
      console.log('👋 Setup wizard exiting. Main application will start...');
      process.exit(0);
    }, 2000);
  } catch (error) {
    console.error('Error completing setup:', error);
    res.status(500).json({
      success: false,
      message: `Setup completion failed: ${error.message}`,
    });
  }
});

/**
 * GET /api/defaults
 * Get default configuration values for the current environment
 */
app.get('/api/defaults', (req, res) => {
  try {
    const dbPassword = generateDatabasePassword();
    const envDefaults = getEnvironmentDefaults(dbPassword);
    const prodDefaults = getProductionDefaults();
    const featureDefaults = getFeatureDefaults();
    const mcpDefaults = getMCPDefaults();

    res.json({
      success: true,
      docker: isDocker(),
      defaults: {
        ...envDefaults,
        ...prodDefaults,
        ...featureDefaults,
        ...mcpDefaults,
      },
    });
  } catch (error) {
    console.error('Error getting defaults:', error);
    res.status(500).json({
      success: false,
      message: `Failed to get defaults: ${error.message}`,
    });
  }
});

// ============================================
// SERVE FRONTEND
// ============================================

// Root route - serve landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message,
  });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║          🚀 Plugged.in Setup Wizard                       ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📋 Setup wizard running on: http://localhost:${PORT}`);
  console.log(`🐳 Docker environment: ${isDocker() ? 'Yes' : 'No'}`);
  console.log(`💻 Platform: ${process.platform}`);
  console.log(`📦 Node version: ${process.version}`);
  console.log('');
  console.log('Open your browser to begin setup!');
  console.log('');
});
