/**
 * Secure Path Builder - Centralized path operations with security validation
 * This module provides secure path building and validation to prevent path traversal attacks
 */

import { isAbsolute, join, normalize, resolve } from 'path';

import { isPathWithinDirectory } from './security';

/**
 * Validates a single path component for security issues
 * @throws Error if the component is invalid or dangerous
 */
export function validatePathComponent(component: string): string {
  if (!component || typeof component !== 'string') {
    throw new Error('Path component must be a non-empty string');
  }

  // Check for null bytes
  if (component.includes('\0')) {
    throw new Error('Path component contains null byte');
  }

  // Check for path traversal sequences
  if (component === '..' || component === '.' ||
      component.includes('../') || component.includes('..\\') ||
      component.includes('/..') || component.includes('\\..')) {
    throw new Error('Path traversal attempt detected');
  }

  // Check for absolute paths (they shouldn't be in components)
  if (isAbsolute(component)) {
    throw new Error('Absolute paths not allowed in components');
  }

  // Check for dangerous patterns
  const dangerousPatterns = [
    /^\.{2,}/, // Multiple dots at start
    /\0/,      // Null bytes
    /[<>"|?*]/, // Invalid filename characters on Windows
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(component)) {
      throw new Error(`Invalid characters in path component: ${component}`);
    }
  }

  return component;
}

/**
 * Get the base upload directory based on environment
 */
export function getSecureBaseUploadDir(): string {
  const baseDir = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');
  // Normalize and resolve to absolute path
  return resolve(normalize(baseDir));
}

/**
 * Build a secure path from components with validation at each step
 * All components are validated BEFORE joining to prevent injection
 */
export function buildSecurePath(baseDir: string, ...components: string[]): string {
  // Validate base directory
  if (!baseDir || !isAbsolute(baseDir)) {
    throw new Error('Base directory must be an absolute path');
  }

  // Normalize base directory
  // Security: baseDir is validated as absolute path above, preventing traversal
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal
  const normalizedBase = resolve(normalize(baseDir));

  // Validate each component BEFORE joining
  const validatedComponents = components.map(component => {
    try {
      return validatePathComponent(component);
    } catch (error) {
      throw new Error(`Invalid path component: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Join the validated components
  // Security: All components are validated by validatePathComponent before joining
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal
  const joinedPath = join(normalizedBase, ...validatedComponents);

  // Normalize the final path to remove any remaining traversal attempts
  // Security: Final normalization and boundary check ensure path safety
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal
  const finalPath = resolve(normalize(joinedPath));

  // Final security check: ensure the path is within the base directory
  if (!isPathWithinDirectory(finalPath, normalizedBase)) {
    throw new Error('Security violation: Path escapes base directory');
  }

  return finalPath;
}

/**
 * Build a secure version directory path
 * Pre-validates all inputs before constructing the path
 */
export function buildSecureVersionDir(
  baseUploadDir: string,
  userId: string,
  documentId: string
): string {
  // Validate inputs first
  if (!userId || !documentId) {
    throw new Error('User ID and Document ID are required');
  }

  // Build the path with validation at each step
  return buildSecurePath(baseUploadDir, userId, 'versions', documentId);
}

/**
 * Build a secure version file path
 * Pre-validates all inputs before constructing the path
 */
export function buildSecureVersionFilePath(
  versionDir: string,
  filename: string
): string {
  // Validate filename doesn't contain path separators
  if (filename.includes('/') || filename.includes('\\')) {
    throw new Error('Filename cannot contain path separators');
  }

  // Validate the version directory is absolute
  if (!isAbsolute(versionDir)) {
    throw new Error('Version directory must be an absolute path');
  }

  // Join and validate
  // Security: filename is validated above to not contain path separators
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal
  const filePath = join(versionDir, filename);

  // Ensure file is within version directory
  if (!isPathWithinDirectory(filePath, versionDir)) {
    throw new Error('File path escapes version directory');
  }

  return filePath;
}

/**
 * Validate and normalize a file path from database storage
 * This is used when retrieving paths that were previously stored
 */
export function validateStoredPath(storedPath: string, baseDir: string): string {
  if (!storedPath) {
    throw new Error('Stored path is empty');
  }

  // Check for obvious traversal attempts
  if (storedPath.includes('../') || storedPath.includes('..\\')) {
    throw new Error('Stored path contains traversal sequences');
  }

  // Build the full path
  // Security: storedPath is checked for traversal sequences above
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal
  const fullPath = isAbsolute(storedPath)
    ? storedPath
    : join(baseDir, storedPath);

  // Normalize and resolve
  // Security: Path is validated against base directory boundary below
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal
  const normalizedPath = resolve(normalize(fullPath));

  // Validate it's within base directory
  if (!isPathWithinDirectory(normalizedPath, baseDir)) {
    throw new Error('Stored path escapes base directory');
  }

  return normalizedPath;
}

/**
 * Extract and validate a relative path for database storage
 * Ensures the path is safe to store and retrieve later
 */
export function extractRelativePath(fullPath: string, baseDir: string): string {
  // Both paths must be absolute
  if (!isAbsolute(fullPath) || !isAbsolute(baseDir)) {
    throw new Error('Both paths must be absolute');
  }

  // Normalize both paths
  // Security: Both paths are absolute and will be compared for containment
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal
  const normalizedFull = resolve(normalize(fullPath));
  const normalizedBase = resolve(normalize(baseDir));

  // Ensure full path is within base directory
  if (!normalizedFull.startsWith(normalizedBase)) {
    throw new Error('Path is not within base directory');
  }

  // Extract relative path
  const relative = normalizedFull.substring(normalizedBase.length);

  // Remove leading slash if present
  return relative.startsWith('/') || relative.startsWith('\\')
    ? relative.substring(1)
    : relative;
}