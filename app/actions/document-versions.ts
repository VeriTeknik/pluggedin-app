'use server';

import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
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
 * Note: This is a minimal implementation for production hotfix
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

    // For now, return a placeholder since version system isn't fully deployed
    // This prevents build errors while maintaining the interface
    return {
      success: false,
      error: 'Version history is temporarily unavailable. Please try again later.'
    };
  } catch (error) {
    // Handle validation errors
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message || 'Invalid input'
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch version content'
    };
  }
}