import { and, asc, eq, gt } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { apiKeysTable, deviceAuthCodesTable, projectsTable } from '@/db/schema';
import { createErrorResponse, ErrorResponses } from '@/lib/api-errors';

import { validateDeviceAuthAction } from '../_shared';

const apiKeyGen = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  64
);

const projectUuidSchema = z.string().uuid().optional();

// Note: No CSRF token needed — the user_code (visible only in the user's terminal
// and on this authenticated page) acts as an implicit CSRF token.
export async function POST(request: NextRequest) {
  const result = await validateDeviceAuthAction(request);
  if (!result.ok) return result.response;

  const { record, session, body } = result;

  // Parse optional project_uuid from the body
  const projectUuidResult = projectUuidSchema.safeParse(body.project_uuid);
  const project_uuid = projectUuidResult.success ? projectUuidResult.data : undefined;

  // Determine which project to use
  let targetProjectUuid: string;

  if (project_uuid) {
    const project = await db.query.projectsTable.findFirst({
      where: eq(projectsTable.uuid, project_uuid),
      columns: { uuid: true, user_id: true },
    });
    if (!project || project.user_id !== session.user.id) {
      return ErrorResponses.forbidden();
    }
    targetProjectUuid = project.uuid;
  } else {
    const project = await db.query.projectsTable.findFirst({
      where: eq(projectsTable.user_id, session.user.id),
      columns: { uuid: true },
      orderBy: asc(projectsTable.created_at),
    });
    if (!project) {
      return createErrorResponse('No Hub found for user', 400, 'NO_HUB');
    }
    targetProjectUuid = project.uuid;
  }

  // Create API key and approve device code atomically
  // The WHERE clause includes status='pending' and expires_at check
  // to prevent TOCTOU race conditions
  const apiKey = `pg_in_${apiKeyGen()}`;

  const approved = await db.transaction(async (tx) => {
    const [newKey] = await tx.insert(apiKeysTable).values({
      project_uuid: targetProjectUuid,
      api_key: apiKey,
      name: 'Claude Code (auto-provisioned)',
    }).returning({ uuid: apiKeysTable.uuid });

    const updated = await tx.update(deviceAuthCodesTable)
      .set({
        status: 'approved',
        api_key_uuid: newKey.uuid,
        user_id: session.user.id,
        project_uuid: targetProjectUuid,
        approved_at: new Date(),
      })
      .where(
        and(
          eq(deviceAuthCodesTable.uuid, record.uuid),
          eq(deviceAuthCodesTable.status, 'pending'),
          gt(deviceAuthCodesTable.expires_at, new Date())
        )
      )
      .returning({ uuid: deviceAuthCodesTable.uuid });

    if (updated.length === 0) {
      // Status changed or code expired between validation and UPDATE.
      // Must throw (not return) to roll back the apiKeysTable insert above.
      throw new Error('DEVICE_CODE_CONFLICT');
    }

    return true;
  }).catch((err: Error) => {
    if (err.message === 'DEVICE_CODE_CONFLICT') return false;
    throw err;
  });

  if (!approved) {
    return createErrorResponse('Authorization code already used or expired', 409, 'CONFLICT');
  }

  return NextResponse.json({ status: 'approved' });
}
