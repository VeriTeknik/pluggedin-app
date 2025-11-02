import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dynamically import and validate encryption key only in Node.js runtime
    const { validateEncryptionKey } = await import('./lib/encryption');
    validateEncryptionKey();

    // Ensure uploads directory exists at startup to avoid race conditions
    const { existsSync, mkdirSync } = await import('fs');
    const { join } = await import('path');
    const uploadsDir = join(process.cwd(), 'uploads');

    try {
      if (!existsSync(uploadsDir)) {
        mkdirSync(uploadsDir, { recursive: true });
        console.log(`[Startup] Created uploads directory at: ${uploadsDir}`);
      }
    } catch (err) {
      console.error(
        `[Startup] Failed to create uploads directory: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      // Don't exit - let the application handle upload errors gracefully
    }

    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
