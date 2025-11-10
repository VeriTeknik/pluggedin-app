import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dynamically import and validate encryption key only in Node.js runtime
    const { validateEncryptionKey } = await import('./lib/encryption');
    validateEncryptionKey();

    // Ensure uploads directory exists at startup to avoid race conditions
    const { existsSync, mkdirSync, realpathSync } = await import('fs');
    const { join } = await import('path');
    const uploadsDir = join(process.cwd(), 'uploads');

    try {
      if (!existsSync(uploadsDir)) {
        mkdirSync(uploadsDir, { recursive: true });
        console.log(`[Startup] Created uploads directory at: ${uploadsDir}`);
      }

      // Cache resolved uploads directory path for security validation
      const resolvedUploadsDir = realpathSync(uploadsDir);
      global.RESOLVED_UPLOADS_DIR = resolvedUploadsDir;
      console.log(`[Startup] Resolved uploads directory: ${resolvedUploadsDir}`);
    } catch (err) {
      console.error(
        `[Startup] Failed to create uploads directory: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      // Don't exit - let the application handle upload errors gracefully
    }

    // Start OAuth token lock cleanup service
    // This prevents stuck locks from failed token refresh attempts
    const { startTokenLockCleanup } = await import('./lib/oauth/token-lock-cleanup');
    startTokenLockCleanup(
      60 * 1000, // Run cleanup every 60 seconds
      60 * 1000  // Clear locks older than 60 seconds
    );
    console.log('[Startup] OAuth token lock cleanup service started');

    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
