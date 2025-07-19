import { createHash } from 'crypto';
import path from 'path';

/**
 * Security utilities for the Plugged.in application
 */

/**
 * Sanitizes a user ID for safe file system operations
 * Generates a deterministic UUID v5 from the user ID for maximum safety
 * @param userId - The user ID to sanitize
 * @returns A safe directory name in UUID format
 */
export function sanitizeUserIdForFileSystem(userId: string): string {
  // Use a namespace UUID for our application (you can generate this once and hardcode it)
  const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // UUID v5 namespace
  
  // Create a deterministic UUID v5 from the user ID
  // This ensures the same user ID always maps to the same UUID
  const hash = createHash('sha256').update(NAMESPACE + userId).digest('hex');
  
  // Format as UUID v5 (8-4-4-4-12 format)
  const uuid = [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '5' + hash.substring(13, 16), // Version 5
    ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16) + hash.substring(18, 20), // Variant
    hash.substring(20, 32)
  ].join('-');
  
  return uuid;
}

/**
 * Validates that a file path is within the allowed directory
 * Prevents path traversal attacks
 * @param filePath - The file path to validate
 * @param allowedDirectory - The directory that files must be within
 * @returns true if the path is safe, false otherwise
 */
export function isPathWithinDirectory(filePath: string, allowedDirectory: string): boolean {
  const resolvedPath = path.resolve(filePath);
  const resolvedAllowedDir = path.resolve(allowedDirectory);
  
  // Ensure the resolved path starts with the allowed directory
  return resolvedPath.startsWith(resolvedAllowedDir + path.sep);
}

/**
 * Validates a filename to ensure it's safe for file system operations
 * @param filename - The filename to validate
 * @returns true if the filename is safe, false otherwise
 */
export function isValidFilename(filename: string): boolean {
  // Check for null bytes
  if (filename.includes('\0')) {
    return false;
  }
  
  // Check for path traversal attempts
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }
  
  // Check for reserved filenames on Windows
  const reservedNames = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
  ];
  
  const nameWithoutExt = filename.split('.')[0].toUpperCase();
  if (reservedNames.includes(nameWithoutExt)) {
    return false;
  }
  
  // Check for valid characters (alphanumeric, dash, underscore, dot)
  const validFilenameRegex = /^[a-zA-Z0-9._-]+$/;
  return validFilenameRegex.test(filename);
}

/**
 * Escapes special characters in a string for safe use in SQL LIKE/ILIKE patterns
 * @param str - The string to escape
 * @returns The escaped string
 */
export function escapeLikePattern(str: string): string {
  // Escape special characters used in LIKE patterns
  return str
    .replace(/\\/g, '\\\\') // Escape backslash first
    .replace(/%/g, '\\%')   // Escape percent
    .replace(/_/g, '\\_')   // Escape underscore
    .replace(/\[/g, '\\[')  // Escape left bracket
    .replace(/\]/g, '\\]'); // Escape right bracket
}

/**
 * Validates that a file has an allowed MIME type
 * @param mimeType - The MIME type to validate
 * @param allowedTypes - Array of allowed MIME types
 * @returns true if the MIME type is allowed, false otherwise
 */
export function isAllowedMimeType(mimeType: string, allowedTypes: string[]): boolean {
  return allowedTypes.includes(mimeType);
}

/**
 * Validates file size is within allowed limits
 * @param size - File size in bytes
 * @param maxSize - Maximum allowed size in bytes
 * @returns true if size is within limits, false otherwise
 */
export function isValidFileSize(size: number, maxSize: number): boolean {
  return size > 0 && size <= maxSize;
}

/**
 * Sanitizes HTML content to prevent XSS attacks
 * This is a wrapper around the sanitize-html library with our default config
 */
export const sanitizeHtmlConfig = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'a', 'ul', 'ol', 'li', 'blockquote',
    'b', 'i', 'strong', 'em', 'code', 'pre',
    'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'img', 'figure', 'figcaption'
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    code: ['class'],
    pre: ['class'],
    '*': ['style'] // Allow style on all tags but sanitize it
  },
  allowedClasses: {
    code: ['language-*'],
    pre: ['language-*']
  },
  allowedStyles: {
    '*': {
      // Only allow specific CSS properties
      'color': [/^#[0-9a-f]{3,6}$/i, /^rgb\(/],
      'background-color': [/^#[0-9a-f]{3,6}$/i, /^rgb\(/],
      'font-size': [/^\d+(?:px|em|rem|%)$/],
      'text-align': [/^(left|center|right|justify)$/],
      'margin': [/^\d+(?:px|em|rem|%)$/],
      'padding': [/^\d+(?:px|em|rem|%)$/]
    }
  },
  // Ensure links are safe
  transformTags: {
    a: (tagName: string, attribs: any) => {
      // Add rel="noopener noreferrer" to external links
      if (attribs.href && attribs.href.startsWith('http')) {
        attribs.rel = 'noopener noreferrer';
      }
      // Remove javascript: URLs
      if (attribs.href && attribs.href.toLowerCase().startsWith('javascript:')) {
        delete attribs.href;
      }
      return {
        tagName,
        attribs
      };
    }
  }
};

/**
 * Rate limiting configuration for different operation types
 */
export const RATE_LIMIT_CONFIG = {
  documentUpload: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50 // 50 uploads per 15 minutes
  },
  documentSearch: {
    windowMs: 60 * 1000, // 1 minute
    max: 100 // 100 searches per minute
  },
  aiDocumentCreation: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100 // 100 AI documents per hour
  }
};