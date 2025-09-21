'use server';

import { z } from 'zod';

import { ensureDocumentAccess } from '@/lib/access/document-access';
import { requireUserId } from '@/lib/auth/server-helpers';
import { validateGetDocumentVersionRequest } from '@/lib/validators/document-versions';
import { getVersionContent } from '@/lib/version-manager';
import { rateLimiter } from '@/lib/rate-limiter';

// Type for the return value
type DocumentVersionContentResult = {
  success: true;
  content: string;
  versionNumber: number;
} | {
  success: false;
  error: string;
};

/**
 * Server action to get version content for a document
 * Uses session authentication instead of API key
 */
export async function getDocumentVersionContent(
  documentId: string,
  versionNumber: number
): Promise<DocumentVersionContentResult> {
  try {
    // Validate inputs
    const { documentId: validatedDocId, versionNumber: validatedVersion } =
      validateGetDocumentVersionRequest({ documentId, versionNumber });

    // Require authenticated user
    const userId = await requireUserId();

    // Apply rate limiting - 30 requests per minute per user
    const rateLimitResult = await rateLimiter.check(
      `version-content:${userId}`,
      30,
      60
    );

    if (!rateLimitResult.success) {
      return {
        success: false,
        error: `Rate limit exceeded. Please wait ${rateLimitResult.reset} seconds before trying again.`
      };
    }

    // Ensure user has access to the document
    await ensureDocumentAccess(validatedDocId, userId);

    // Get version content
    const content = await getVersionContent(
      userId,
      validatedDocId,
      validatedVersion
    );

    if (content === undefined || content === null) {
      return { success: false, error: `Version ${validatedVersion} not found` };
    }

    return {
      success: true,
      content,
      versionNumber: validatedVersion
    };
  } catch (error) {
    // Enhanced error logging with context
    console.error('getDocumentVersionContent failed:', error, {
      documentId,
      versionNumber,
    });

    // Handle specific error types
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message || 'Invalid input'
      };
    }

    if ((error as Error).message === 'UNAUTHORIZED') {
      return { success: false, error: 'Unauthorized' };
    }

    if ((error as Error).message === 'ACCESS_DENIED') {
      return { success: false, error: 'Document not found or access denied' };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch version content'
    };
  }
}