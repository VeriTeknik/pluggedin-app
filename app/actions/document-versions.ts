'use server';

import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { rateLimiter } from '@/lib/rate-limiter';
import { getVersionContent } from '@/lib/version-manager';
import { ensureDocumentAccess } from '@/lib/access/document-access';

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
 * Uses session authentication and validates document access
 */
export async function getDocumentVersionContent(
  documentId: string,
  versionNumber: number
): Promise<DocumentVersionContentResult> {
  try {
    // Validate inputs
    const uuidSchema = z.string().uuid();
    const versionSchema = z.number().int().positive();

    const validatedDocId = uuidSchema.parse(documentId);
    const validatedVersion = versionSchema.parse(versionNumber);

    // Require authenticated user
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const userId = session.user.id;

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
    // Handle specific error types
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message || 'Invalid input'
      };
    }

    if (error instanceof Error && error.message === 'ACCESS_DENIED') {
      return { success: false, error: 'Document not found or access denied' };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch version content'
    };
  }
}