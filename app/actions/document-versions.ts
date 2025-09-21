'use server';

import { and, eq } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { db } from '@/db';
import { docsTable, profilesTable,projectsTable } from '@/db/schema';
import { authOptions } from '@/lib/auth';
import { getVersionContent } from '@/lib/version-manager';

// Input validation schema
const getDocumentVersionContentSchema = z.object({
  documentId: z.string().uuid('Invalid document ID format'),
  versionNumber: z.number().int().positive('Version number must be positive')
});

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
    const validatedInput = getDocumentVersionContentSchema.parse({
      documentId,
      versionNumber
    });

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    // Optimized query: Join documents with profiles and projects to verify access in one query
    const result = await db
      .select({
        document: docsTable,
        profile: profilesTable,
        project: projectsTable
      })
      .from(docsTable)
      .innerJoin(profilesTable, eq(docsTable.profile_uuid, profilesTable.uuid))
      .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
      .where(
        and(
          eq(docsTable.uuid, validatedInput.documentId),
          eq(projectsTable.user_id, session.user.id)
        )
      )
      .limit(1);

    if (result.length === 0) {
      return { success: false, error: 'Document not found or access denied' };
    }

    const { document, profile, project } = result[0];

    // Get version content
    const content = await getVersionContent(
      session.user.id,
      validatedInput.documentId,
      validatedInput.versionNumber
    );

    if (!content) {
      return { success: false, error: `Version ${validatedInput.versionNumber} not found` };
    }

    return {
      success: true,
      content,
      versionNumber: validatedInput.versionNumber
    };
  } catch (error) {
    // Enhanced error logging with context
    console.error('Error fetching version content:', {
      error,
      documentId,
      versionNumber,
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    });

    // Handle Zod validation errors specifically
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