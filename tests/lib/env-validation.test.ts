import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateEnv,
  isEmailConfigured,
  isTranslationAvailable,
  getAvailableAIProviders,
  getEnvVar,
  type EnvValidationResult,
} from '@/lib/env-validation';

describe('Environment Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear environment variables
    process.env = {};
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('validateEnv', () => {
    it('should fail when required variables are missing', () => {
      const result = validateEnv();

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toContain('DATABASE_URL: Required');
      expect(result.errors).toContain('NEXTAUTH_URL: Required');
      expect(result.errors).toContain('NEXTAUTH_SECRET: Required');
    });

    it('should pass with minimal required configuration', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.NEXTAUTH_URL = 'http://localhost:3000';
      process.env.NEXTAUTH_SECRET = 'a'.repeat(32);

      const result = validateEnv();

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should validate URL formats', () => {
      process.env.DATABASE_URL = 'not-a-url';
      process.env.NEXTAUTH_URL = 'also-not-a-url';
      process.env.NEXTAUTH_SECRET = 'a'.repeat(32);

      const result = validateEnv();

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some(e => e.includes('DATABASE_URL'))).toBe(true);
      expect(result.errors?.some(e => e.includes('NEXTAUTH_URL'))).toBe(true);
    });

    it('should validate NEXTAUTH_SECRET length', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.NEXTAUTH_URL = 'http://localhost:3000';
      process.env.NEXTAUTH_SECRET = 'too-short';

      const result = validateEnv();

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some(e => e.includes('NEXTAUTH_SECRET') && e.includes('32 characters'))).toBe(true);
    });

    it('should warn about missing AI API keys', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.NEXTAUTH_URL = 'http://localhost:3000';
      process.env.NEXTAUTH_SECRET = 'a'.repeat(32);

      const result = validateEnv();

      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings).toContain('No AI API keys configured. Email translations will not be available.');
    });

    it('should not warn when at least one AI API key is present', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.NEXTAUTH_URL = 'http://localhost:3000';
      process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

      const result = validateEnv();

      expect(result.valid).toBe(true);
      expect(result.warnings?.includes('No AI API keys configured. Email translations will not be available.')).toBeFalsy();
    });

    it('should validate email configuration completeness', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.NEXTAUTH_URL = 'http://localhost:3000';
      process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
      process.env.EMAIL_SERVER_HOST = 'smtp.example.com';
      // Missing EMAIL_SERVER_PORT and EMAIL_FROM

      const result = validateEnv();

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toContain('EMAIL_SERVER_PORT is required when email is configured');
      expect(result.errors).toContain('EMAIL_FROM is required when email is configured');
    });

    it('should validate email format for EMAIL_FROM', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.NEXTAUTH_URL = 'http://localhost:3000';
      process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
      process.env.EMAIL_FROM = 'not-an-email';

      const result = validateEnv();

      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.includes('EMAIL_FROM') && e.includes('valid email'))).toBe(true);
    });

    it('should validate admin email addresses', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.NEXTAUTH_URL = 'http://localhost:3000';
      process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
      process.env.ADMIN_NOTIFICATION_EMAILS = 'admin@example.com,not-an-email,another@example.com';

      const result = validateEnv();

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toContain('Invalid admin email addresses: not-an-email');
    });

    it('should warn about UNSUBSCRIBE_TOKEN_SECRET fallback', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.NEXTAUTH_URL = 'http://localhost:3000';
      process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
      // No UNSUBSCRIBE_TOKEN_SECRET

      const result = validateEnv();

      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings).toContain('UNSUBSCRIBE_TOKEN_SECRET not set, falling back to NEXTAUTH_SECRET for token generation');
    });

    it('should warn about weak secrets in production', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.NEXTAUTH_URL = 'http://localhost:3000';
      process.env.NEXTAUTH_SECRET = 'a'.repeat(32); // Minimum length but not recommended
      process.env.UNSUBSCRIBE_TOKEN_SECRET = 'b'.repeat(32);

      const result = validateEnv();

      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings).toContain('NEXTAUTH_SECRET is recommended to be at least 64 characters for production');
      expect(result.warnings).toContain('UNSUBSCRIBE_TOKEN_SECRET is recommended to be at least 64 characters for production');
    });

    it('should require NEXT_PUBLIC_APP_URL in production', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.NEXTAUTH_URL = 'http://localhost:3000';
      process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
      // No NEXT_PUBLIC_APP_URL

      const result = validateEnv();

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toContain('NEXT_PUBLIC_APP_URL is required in production');

      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should validate feature flags', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.NEXTAUTH_URL = 'http://localhost:3000';
      process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
      process.env.ENABLE_RAG = 'invalid';

      const result = validateEnv();

      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.includes('ENABLE_RAG'))).toBe(true);
    });
  });

  describe('isEmailConfigured', () => {
    it('should return false when email is not configured', () => {
      expect(isEmailConfigured()).toBe(false);
    });

    it('should return false when partially configured', () => {
      process.env.EMAIL_SERVER_HOST = 'smtp.example.com';
      // Missing PORT and FROM

      expect(isEmailConfigured()).toBe(false);
    });

    it('should return true when fully configured', () => {
      process.env.EMAIL_SERVER_HOST = 'smtp.example.com';
      process.env.EMAIL_SERVER_PORT = '587';
      process.env.EMAIL_FROM = 'noreply@example.com';

      expect(isEmailConfigured()).toBe(true);
    });
  });

  describe('isTranslationAvailable', () => {
    it('should return false when no AI API keys are configured', () => {
      expect(isTranslationAvailable()).toBe(false);
    });

    it('should return true when Anthropic key is configured', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

      expect(isTranslationAvailable()).toBe(true);
    });

    it('should return true when OpenAI key is configured', () => {
      process.env.OPENAI_API_KEY = 'sk-test';

      expect(isTranslationAvailable()).toBe(true);
    });

    it('should return true when Google key is configured', () => {
      process.env.GOOGLE_API_KEY = 'google-test';

      expect(isTranslationAvailable()).toBe(true);
    });
  });

  describe('getAvailableAIProviders', () => {
    it('should return empty array when no providers are configured', () => {
      expect(getAvailableAIProviders()).toEqual([]);
    });

    it('should return all configured providers', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      process.env.OPENAI_API_KEY = 'sk-test';
      process.env.GOOGLE_API_KEY = 'google-test';

      expect(getAvailableAIProviders()).toEqual(['Anthropic', 'OpenAI', 'Google']);
    });

    it('should return only configured providers', () => {
      process.env.OPENAI_API_KEY = 'sk-test';

      expect(getAvailableAIProviders()).toEqual(['OpenAI']);
    });
  });

  describe('getEnvVar', () => {
    it('should return undefined for missing variables', () => {
      expect(getEnvVar('ANTHROPIC_API_KEY')).toBeUndefined();
    });

    it('should return value for configured variables', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.NEXTAUTH_URL = 'http://localhost:3000';
      process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

      expect(getEnvVar('ANTHROPIC_API_KEY')).toBe('sk-ant-test');
    });
  });
});