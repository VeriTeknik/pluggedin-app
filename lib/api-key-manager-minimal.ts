/**
 * API Key Management - Minimal implementation without database dependency
 * This is a temporary implementation until the apiKeys table is added to the schema
 */

import { randomBytes } from 'crypto';
import log from './logger';

// Configuration
const API_KEY_LENGTH = 32; // Length in bytes (64 chars when hex encoded)
const API_KEY_PREFIX = 'pg_in_'; // Prefix for all API keys
const DEFAULT_EXPIRATION_DAYS = 90; // Default expiration period
const MAX_KEYS_PER_USER = 5; // Maximum API keys per profile

/**
 * Generate a new secure API key
 */
export function generateApiKey(): string {
  const randomPart = randomBytes(API_KEY_LENGTH).toString('hex');
  return `${API_KEY_PREFIX}${randomPart}`;
}

/**
 * Validate API key format (basic validation without database check)
 */
export function validateApiKeyFormat(apiKey: string): boolean {
  if (!apiKey || !apiKey.startsWith(API_KEY_PREFIX)) {
    return false;
  }
  
  // Check length (prefix + 64 hex chars)
  const expectedLength = API_KEY_PREFIX.length + (API_KEY_LENGTH * 2);
  if (apiKey.length !== expectedLength) {
    return false;
  }
  
  // Check if the part after prefix is valid hex
  const hexPart = apiKey.substring(API_KEY_PREFIX.length);
  const hexRegex = /^[a-f0-9]+$/i;
  
  return hexRegex.test(hexPart);
}

/**
 * Create a mock API key response (for testing without database)
 */
export function createMockApiKey(name: string, profileUuid: string): {
  success: boolean;
  apiKey: string;
  id: string;
  expiresAt: Date;
  preview: string;
} {
  const apiKey = generateApiKey();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + DEFAULT_EXPIRATION_DAYS);
  
  const preview = apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 4);
  const id = randomBytes(16).toString('hex');
  
  log.info('Mock API key created', {
    name,
    profileUuid,
    id,
    preview,
    expiresAt,
  });
  
  return {
    success: true,
    apiKey,
    id,
    expiresAt,
    preview,
  };
}

// Export configuration constants
export const API_KEY_CONFIG = {
  PREFIX: API_KEY_PREFIX,
  LENGTH: API_KEY_LENGTH,
  DEFAULT_EXPIRATION_DAYS,
  MAX_KEYS_PER_USER,
};

export default {
  generateApiKey,
  validateApiKeyFormat,
  createMockApiKey,
  API_KEY_CONFIG,
};