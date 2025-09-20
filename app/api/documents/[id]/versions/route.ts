import { and,eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { logAuditEvent } from '@/app/actions/audit-logger';
import { authenticateApiKey } from '@/app/api/auth';
import { db } from '@/db';
import { docsTable } from '@/db/schema';
import { listDocumentVersions } from '@/lib/version-manager';

/**
 * @swagger
 * /api/documents/{id}/versions:
 *   get:
 *     summary: List document versions
 *     description: Get a list of all versions for a document
 *     tags:
 *       - Documents
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document UUID
 *     responses:
 *       200:
 *         description: Versions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 versions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       versionNumber:
 *                         type: integer
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       createdByModel:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           provider:
 *                             type: string
 *                           version:
 *                             type: string
 *                       changeSummary:
 *                         type: string
 *                       isCurrent:
 *                         type: boolean
 *       404:
 *         description: Document not found
 *       401:
 *         description: Unauthorized
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate API key
    const authResult = await authenticateApiKey(request);
    if (authResult.error) {
      return authResult.error;
    }

    const resolvedParams = await params;
    const documentId = resolvedParams.id;

    // Verify the user has access to this document
    const [document] = await db
      .select()
      .from(docsTable)
      .where(
        and(
          eq(docsTable.uuid, documentId),
          eq(docsTable.profile_uuid, authResult.activeProfile.uuid)
        )
      )
      .limit(1);

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      );
    }

    // Get versions list
    const versions = await listDocumentVersions(documentId);

    // Remove file paths from response for security
    const sanitizedVersions = versions.map(v => ({
      versionNumber: v.versionNumber,
      createdAt: v.createdAt,
      createdByModel: v.createdByModel,
      changeSummary: v.changeSummary,
      isCurrent: v.isCurrent
      // Explicitly exclude filePath and ragDocumentId
    }));

    // Log audit event
    await logAuditEvent({
      profileUuid: authResult.activeProfile.uuid,
      type: 'MCP_REQUEST',
      action: 'LIST_DOCUMENT_VERSIONS',
      metadata: {
        documentId,
        versionCount: sanitizedVersions.length
      }
    });

    return NextResponse.json({
      success: true,
      versions: sanitizedVersions
    });
  } catch (error) {
    console.error('Error listing document versions:', error);
    return NextResponse.json(
      { error: 'Failed to list document versions' },
      { status: 500 }
    );
  }
}