/**
 * Path Validation Utilities
 * Centralizes all path validation logic to prevent traversal attacks
 */

import { z } from 'zod';

/**
 * UUID validation schema
 */
const uuidSchema = z.string().uuid();

/**
 * Safe filename schema - alphanumeric, dots, hyphens, underscores only
 */
const safeFilenameSchema = z.string()
  .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid filename characters')
  .max(255, 'Filename too long')
  .refine(val => !val.startsWith('.'), 'Filename cannot start with dot')
  .refine(val => !val.includes('..'), 'Filename cannot contain double dots')
  .refine(val => !val.includes('\0'), 'Filename cannot contain null bytes');

/**
 * Version number schema
 */
const versionNumberSchema = z.number()
  .int()
  .positive()
  .max(999999, 'Version number too large');

/**
 * Validate and sanitize a document ID (must be UUID)
 */
export function validateDocumentId(documentId: string): string {
  const result = uuidSchema.safeParse(documentId);
  if (!result.success) {
    throw new Error(`Invalid document ID: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Validate and sanitize a user ID (can be various formats)
 */
export function validateUserId(userId: string): string {
  // Remove any path traversal attempts
  const cleaned = userId
    .replace(/\.\./g, '')
    .replace(/[\/\\]/g, '_')
    .replace(/:/g, '_')
    .replace(/\0/g, '');

  // Ensure it's not empty after cleaning
  if (!cleaned || cleaned.length === 0) {
    throw new Error('Invalid user ID after sanitization');
  }

  // Limit length
  if (cleaned.length > 100) {
    throw new Error('User ID too long');
  }

  return cleaned;
}

/**
 * Validate a version number
 */
export function validateVersionNumber(version: number): number {
  const result = versionNumberSchema.safeParse(version);
  if (!result.success) {
    throw new Error(`Invalid version number: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Validate a filename
 */
export function validateFilename(filename: string): string {
  const result = safeFilenameSchema.safeParse(filename);
  if (!result.success) {
    throw new Error(`Invalid filename: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Check if a path component is safe (no traversal)
 */
export function isSafePathComponent(component: string): boolean {
  const dangerous = [
    '..',
    '.',
    '',
    '~',
    '.git',
    '.ssh',
    '.env'
  ];

  return !dangerous.includes(component) &&
         !component.includes('/') &&
         !component.includes('\\') &&
         !component.includes('\0');
}

/**
 * Validate all components of a path are safe
 */
export function validatePathComponents(components: string[]): string[] {
  return components.map(component => {
    if (!isSafePathComponent(component)) {
      throw new Error(`Unsafe path component: ${component}`);
    }
    return component;
  });
}

/**
 * Create a safe path from validated components
 */
export function createSafePath(...components: string[]): string {
  const validated = validatePathComponents(components);
  return validated.join('/');
}