import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiKey } from '@/app/api/auth';
import { db } from '@/db';
import { docsTable } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getVersionContent, restoreVersion } from '@/lib/version-manager';
import { logAuditEvent } from '@/app/actions/audit-logger';

/**
 * @swagger
 * /api/documents/{id}/versions/{version}:
 *   get:
 *     summary: Get specific version content
 *     description: Retrieve the content of a specific document version
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
 *       - in: path
 *         name: version
 *         required: true
 *         schema:
 *           type: integer
 *         description: Version number
 *     responses:
 *       200:
 *         description: Version content retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 content:
 *                   type: string
 *                 versionNumber:
 *                   type: integer
 *       404:
 *         description: Document or version not found
 *       401:
 *         description: Unauthorized
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  try {
    // Authenticate API key
    const authResult = await authenticateApiKey(request);
    if (authResult.error) {
      return authResult.error;
    }

    const resolvedParams = await params;
    const documentId = resolvedParams.id;
    const versionNumber = parseInt(resolvedParams.version);

    if (isNaN(versionNumber)) {
      return NextResponse.json(
        { error: 'Invalid version number' },
        { status: 400 }
      );
    }

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

    // Get version content
    const content = await getVersionContent(
      authResult.user.id,
      documentId,
      versionNumber
    );

    if (!content) {
      return NextResponse.json(
        { error: 'Version not found' },
        { status: 404 }
      );
    }

    // Log audit event
    await logAuditEvent({
      profileUuid: authResult.activeProfile.uuid,
      type: 'MCP_REQUEST',
      action: 'GET_DOCUMENT_VERSION',
      metadata: {
        documentId,
        versionNumber
      }
    });

    return NextResponse.json({
      success: true,
      content,
      versionNumber
    });
  } catch (error) {
    console.error('Error fetching document version:', error);
    return NextResponse.json(
      { error: 'Failed to fetch document version' },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/documents/{id}/versions/{version}:
 *   post:
 *     summary: Restore document version
 *     description: Restore a specific version as the current version
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
 *       - in: path
 *         name: version
 *         required: true
 *         schema:
 *           type: integer
 *         description: Version number to restore
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               restoredByModel:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   provider:
 *                     type: string
 *                   version:
 *                     type: string
 *     responses:
 *       200:
 *         description: Version restored successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Document or version not found
 *       401:
 *         description: Unauthorized
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  try {
    // Authenticate API key
    const authResult = await authenticateApiKey(request);
    if (authResult.error) {
      return authResult.error;
    }

    const resolvedParams = await params;
    const documentId = resolvedParams.id;
    const versionNumber = parseInt(resolvedParams.version);

    if (isNaN(versionNumber)) {
      return NextResponse.json(
        { error: 'Invalid version number' },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const restoredByModel = body.restoredByModel;

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

    // Restore the version
    const success = await restoreVersion(
      authResult.user.id,
      documentId,
      versionNumber,
      restoredByModel
    );

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to restore version' },
        { status: 500 }
      );
    }

    // Log audit event
    await logAuditEvent({
      profileUuid: authResult.activeProfile.uuid,
      type: 'MCP_REQUEST',
      action: 'RESTORE_DOCUMENT_VERSION',
      metadata: {
        documentId,
        versionNumber,
        restoredByModel
      }
    });

    return NextResponse.json({
      success: true,
      message: `Version ${versionNumber} restored successfully`
    });
  } catch (error) {
    console.error('Error restoring document version:', error);
    return NextResponse.json(
      { error: 'Failed to restore document version' },
      { status: 500 }
    );
  }
}