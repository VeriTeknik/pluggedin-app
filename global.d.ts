// Global type declarations for application-wide variables

declare global {
  /**
   * Cached resolved uploads directory path set at application startup
   * Used for security validation to prevent symlink path traversal attacks
   */
  var RESOLVED_UPLOADS_DIR: string | undefined;
}

export {};
