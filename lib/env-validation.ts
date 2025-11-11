import { z } from 'zod';

// Define the schema for environment variables
const envSchema = z.object({
  // Required Database
  DATABASE_URL: z.string().url().min(1, 'DATABASE_URL is required'),

  // Required Auth
  NEXTAUTH_URL: z.string().url().min(1, 'NEXTAUTH_URL is required'),
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),

  // Required for unsubscribe tokens
  UNSUBSCRIBE_TOKEN_SECRET: z.string().min(32, 'UNSUBSCRIBE_TOKEN_SECRET must be at least 32 characters').optional(),

  // AI API Keys (at least one required for translations)
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),

  // Email Configuration (required for email sending)
  EMAIL_SERVER_HOST: z.string().optional(),
  EMAIL_SERVER_PORT: z.string().regex(/^\d+$/, 'EMAIL_SERVER_PORT must be a number').optional(),
  EMAIL_SERVER_USER: z.string().optional(),
  EMAIL_SERVER_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().email('EMAIL_FROM must be a valid email').optional(),

  // Admin Configuration
  ADMIN_NOTIFICATION_EMAILS: z.string().optional(),
  ADMIN_MIGRATION_SECRET: z.string().optional(),

  // Feature Flags
  ENABLE_RAG: z.enum(['true', 'false']).optional(),
  ENABLE_NOTIFICATIONS: z.enum(['true', 'false']).optional(),
  ENABLE_EMAIL_VERIFICATION: z.enum(['true', 'false']).optional(),

  // App Configuration
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  PLUGGEDIN_API_KEY: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

// Validation result type
export interface EnvValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Validates environment variables and returns validation result
 */
export function validateEnv(): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Parse and validate environment variables
    const env = envSchema.parse(process.env);

    // Check for AI API keys (at least one required for translations)
    if (!env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY && !env.GOOGLE_API_KEY) {
      warnings.push('No AI API keys configured. Email translations will not be available.');
    }

    // Check for email configuration
    if (env.EMAIL_SERVER_HOST || env.EMAIL_SERVER_PORT || env.EMAIL_SERVER_USER || env.EMAIL_SERVER_PASSWORD) {
      // If any email config is set, all should be set
      if (!env.EMAIL_SERVER_HOST) errors.push('EMAIL_SERVER_HOST is required when email is configured');
      if (!env.EMAIL_SERVER_PORT) errors.push('EMAIL_SERVER_PORT is required when email is configured');
      if (!env.EMAIL_SERVER_USER) warnings.push('EMAIL_SERVER_USER is recommended for email authentication');
      if (!env.EMAIL_SERVER_PASSWORD) warnings.push('EMAIL_SERVER_PASSWORD is recommended for email authentication');
      if (!env.EMAIL_FROM) errors.push('EMAIL_FROM is required when email is configured');
    }

    // Check for unsubscribe token secret
    if (!env.UNSUBSCRIBE_TOKEN_SECRET && env.NEXTAUTH_SECRET) {
      warnings.push('UNSUBSCRIBE_TOKEN_SECRET not set, falling back to NEXTAUTH_SECRET for token generation');
    }

    // Check for admin emails
    if (env.ADMIN_NOTIFICATION_EMAILS) {
      const emails = env.ADMIN_NOTIFICATION_EMAILS.split(',').map(e => e.trim());
      const invalidEmails = emails.filter(email => !z.string().email().safeParse(email).success);
      if (invalidEmails.length > 0) {
        errors.push(`Invalid admin email addresses: ${invalidEmails.join(', ')}`);
      }
    }

    // Check NEXTAUTH_SECRET strength
    if (env.NEXTAUTH_SECRET && env.NEXTAUTH_SECRET.length < 64) {
      warnings.push('NEXTAUTH_SECRET is recommended to be at least 64 characters for production');
    }

    // Check UNSUBSCRIBE_TOKEN_SECRET strength
    if (env.UNSUBSCRIBE_TOKEN_SECRET && env.UNSUBSCRIBE_TOKEN_SECRET.length < 64) {
      warnings.push('UNSUBSCRIBE_TOKEN_SECRET is recommended to be at least 64 characters for production');
    }

    // Check if running in production without NEXT_PUBLIC_APP_URL
    if (process.env.NODE_ENV === 'production' && !env.NEXT_PUBLIC_APP_URL) {
      errors.push('NEXT_PUBLIC_APP_URL is required in production');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const zodErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      return {
        valid: false,
        errors: zodErrors,
      };
    }

    return {
      valid: false,
      errors: ['Unknown error during environment validation'],
    };
  }
}

/**
 * Validates environment variables on startup and logs results
 */
export function validateEnvOnStartup(): void {
  const result = validateEnv();

  if (!result.valid) {
    console.error('❌ Environment validation failed:');
    result.errors?.forEach(error => console.error(`  • ${error}`));

    if (process.env.NODE_ENV === 'production') {
      // Exit in production if validation fails
      process.exit(1);
    }
  }

  if (result.warnings && result.warnings.length > 0) {
    console.warn('⚠️  Environment validation warnings:');
    result.warnings.forEach(warning => console.warn(`  • ${warning}`));
  }

  if (result.valid && (!result.warnings || result.warnings.length === 0)) {
    console.log('✅ Environment validation passed');
  }
}

/**
 * Get a validated environment variable with type safety
 */
export function getEnvVar<K extends keyof EnvConfig>(key: K): EnvConfig[K] | undefined {
  const result = envSchema.safeParse(process.env);
  if (result.success) {
    return result.data[key];
  }
  return undefined;
}

/**
 * Check if email is properly configured
 */
export function isEmailConfigured(): boolean {
  return !!(
    process.env.EMAIL_SERVER_HOST &&
    process.env.EMAIL_SERVER_PORT &&
    process.env.EMAIL_FROM
  );
}

/**
 * Check if AI translation is available
 */
export function isTranslationAvailable(): boolean {
  return !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GOOGLE_API_KEY
  );
}

/**
 * Get configured AI providers
 */
export function getAvailableAIProviders(): string[] {
  const providers: string[] = [];
  if (process.env.ANTHROPIC_API_KEY) providers.push('Anthropic');
  if (process.env.OPENAI_API_KEY) providers.push('OpenAI');
  if (process.env.GOOGLE_API_KEY) providers.push('Google');
  return providers;
}

/**
 * Validate OAuth-specific environment variables with detailed diagnostics
 * Provides more detailed OAuth-specific warnings beyond the general env validation
 */
export function validateOAuthEnvironment(): void {
  const warnings: string[] = [];

  // Check NEXTAUTH_URL value (complementary to zod validation)
  if (!process.env.NEXTAUTH_URL) {
    warnings.push('⚠️  NEXTAUTH_URL is not set - OAuth redirects will fail');
  } else {
    try {
      const url = new URL(process.env.NEXTAUTH_URL);

      // Warn if using localhost in production
      if (process.env.NODE_ENV === 'production' && url.hostname === 'localhost') {
        warnings.push('⚠️  NEXTAUTH_URL uses localhost in production - OAuth callbacks will fail!');
        warnings.push('   Set NEXTAUTH_URL to your public domain (e.g., https://app.plugged.in)');
      }

      // Error if using 0.0.0.0 (this should never be used)
      if (url.hostname === '0.0.0.0') {
        console.error('❌ NEXTAUTH_URL cannot use 0.0.0.0 - OAuth will fail!');
        console.error('   Use localhost for development or your public domain for production');
      }

      // Warn if not using HTTPS in production
      if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
        warnings.push('⚠️  NEXTAUTH_URL not using HTTPS in production');
        warnings.push('   OAuth providers may reject non-HTTPS redirect URLs');
      }
    } catch (error) {
      console.error('❌ NEXTAUTH_URL is not a valid URL:', process.env.NEXTAUTH_URL);
    }
  }

  // Log OAuth-specific warnings
  if (warnings.length > 0) {
    console.warn('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.warn('  OAuth Configuration Warnings');
    console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    warnings.forEach(warning => console.warn(warning));
    console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

/**
 * Get OAuth configuration summary for debugging
 */
export function getOAuthConfigSummary(): Record<string, string> {
  return {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || '❌ NOT SET (OAuth will fail!)',
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? '✓ SET' : '❌ NOT SET',
    NODE_ENV: process.env.NODE_ENV || 'development',
    REDIRECT_BASE: process.env.NEXTAUTH_URL || 'http://localhost:12005 (fallback)',
  };
}

/**
 * Log OAuth configuration summary (safe for logs - no secrets)
 */
export function logOAuthConfigSummary(): void {
  const summary = getOAuthConfigSummary();
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  OAuth Configuration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Object.entries(summary).forEach(([key, value]) => {
    const status = value.includes('❌') ? '❌' : value.includes('✓') ? '✓ ' : '  ';
    console.log(`${status} ${key}: ${value}`);
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}