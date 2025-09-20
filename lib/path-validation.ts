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
 * Validate a user ID with strict pattern matching to prevent collisions
 * Only allows alphanumeric, underscore, hyphen, and period characters
 */
export function validateUserId(userId: string): string {
  // Check for empty or invalid type
  if (!userId || typeof userId !== 'string') {
    throw new Error('User ID must be a non-empty string');
  }

  // Trim whitespace
  const trimmed = userId.trim();

  // Check length constraints
  if (trimmed.length === 0) {
    throw new Error('User ID is empty');
  }

  if (trimmed.length > 100) {
    throw new Error('User ID exceeds maximum length of 100 characters');
  }

  // Only allow safe characters: alphanumeric, underscore, hyphen, and period
  // This prevents ambiguous mapping and ID collisions
  const validUserIdPattern = /^[a-zA-Z0-9_.-]+$/;

  if (!validUserIdPattern.test(trimmed)) {
    throw new Error(`User ID contains invalid characters. Only alphanumeric, underscore, hyphen, and period are allowed.`);
  }

  // Check for dangerous patterns even in valid character set
  if (trimmed === '.' || trimmed === '..' ||
      trimmed.startsWith('.') || trimmed.endsWith('.')) {
    throw new Error('User ID cannot be or start/end with dots');
  }

  return trimmed;
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
 * Expanded list includes Windows reserved names and common dangerous files
 */
export function isSafePathComponent(component: string): boolean {
  // Convert to lowercase for case-insensitive comparison
  const lowerComponent = component.toLowerCase();

  // Expanded list of dangerous components
  const dangerous = [
    // Path navigation
    '..',
    '.',
    '',
    '~',

    // Hidden/config directories
    '.git',
    '.ssh',
    '.env',
    '.aws',
    '.config',
    '.docker',
    '.kube',
    '.npm',
    '.gnupg',
    '.local',

    // Common hidden files
    '.DS_Store',
    '.npmrc',
    '.bashrc',
    '.bash_profile',
    '.zshrc',
    '.profile',
    '.gitconfig',
    '.netrc',
    '.htaccess',
    '.htpasswd',

    // Windows system files
    'Thumbs.db',
    'desktop.ini',
    'config.sys',
    'autoexec.bat',
    'pagefile.sys',
    'hiberfil.sys',
    'swapfile.sys',
    'bootmgr',
    'ntldr',

    // Windows reserved device names (case-insensitive)
    'con',
    'prn',
    'aux',
    'nul',
    'com1',
    'com2',
    'com3',
    'com4',
    'com5',
    'com6',
    'com7',
    'com8',
    'com9',
    'lpt1',
    'lpt2',
    'lpt3',
    'lpt4',
    'lpt5',
    'lpt6',
    'lpt7',
    'lpt8',
    'lpt9',
    'clock$'
  ];

  // Check against dangerous list (case-insensitive for Windows reserved names)
  if (dangerous.includes(lowerComponent)) {
    return false;
  }

  // Check for Windows reserved names with extensions (e.g., 'con.txt')
  const windowsReserved = ['con', 'prn', 'aux', 'nul', 'com', 'lpt'];
  for (const reserved of windowsReserved) {
    if (lowerComponent === reserved ||
        lowerComponent.startsWith(reserved + '.') ||
        (reserved !== 'com' && reserved !== 'lpt' && lowerComponent === reserved)) {
      return false;
    }
  }

  // Check for path separators and null bytes
  return !component.includes('/') &&
         !component.includes('\\') &&
         !component.includes('\0') &&
         // Also check for URL encoded traversal
         !component.includes('%2e%2e') &&
         !component.includes('%2f') &&
         !component.includes('%5c');
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