'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';
import { z } from 'zod';

import { db } from '@/db';
import { apiKeysTable, projectsTable } from '@/db/schema';
import { withAuth, withProjectAuth } from '@/lib/auth-helpers';
import { ApiKey } from '@/types/api-key';
import { getAuthSession } from '@/lib/auth';

const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  64
);

// Validation schemas
const uuidSchema = z.string().uuid('Invalid UUID format');
const apiKeyNameSchema = z.string().min(1).max(100).optional();
const apiKeyScopeSchema = z.enum(['all_projects', 'specific_projects']);
const projectUuidsSchema = z.array(z.string().uuid()).optional();

export async function createApiKey(projectUuid: string, name?: string) {
  // Validate inputs
  const validatedProjectUuid = uuidSchema.parse(projectUuid);
  const validatedName = apiKeyNameSchema.parse(name);

  return withProjectAuth(validatedProjectUuid, async (session, project) => {
    const newApiKey = `pg_in_${nanoid(64)}`;

    const apiKey = await db
      .insert(apiKeysTable)
      .values({
        // Include user_id from session for new schema
        user_id: session.user.id,
        project_uuid: validatedProjectUuid,
        api_key: newApiKey,
        name: validatedName || 'API Key',
        // Set project-specific permissions for backward compatibility
        project_permissions: [validatedProjectUuid],
        all_projects_access: false,
        is_active: true,
      })
      .returning();

    return apiKey[0] as ApiKey;
  });
}

export async function getFirstApiKey(projectUuid: string) {
  if (!projectUuid) {
    return null;
  }

  // Validate input
  const validatedProjectUuid = uuidSchema.parse(projectUuid);

  return withProjectAuth(validatedProjectUuid, async (session, project) => {
    let apiKey = await db.query.apiKeysTable.findFirst({
      where: eq(apiKeysTable.project_uuid, validatedProjectUuid),
      with: {
        project: true,
        user: true,
      },
    });

    if (!apiKey) {
      const newApiKey = `pg_in_${nanoid(64)}`;
      await db.insert(apiKeysTable).values({
        // Include user_id from session for new schema
        user_id: session.user.id,
        project_uuid: validatedProjectUuid,
        api_key: newApiKey,
        name: 'Default API Key',
        // Set project-specific permissions for backward compatibility
        project_permissions: [validatedProjectUuid],
        all_projects_access: false,
        is_active: true,
      });

      apiKey = await db.query.apiKeysTable.findFirst({
        where: eq(apiKeysTable.project_uuid, validatedProjectUuid),
        with: {
          project: true,
          user: true,
        },
      });
    }

    return apiKey as ApiKey;
  });
}

export async function getApiKeys(projectUuid: string) {
  // Validate input
  const validatedProjectUuid = uuidSchema.parse(projectUuid);

  return withProjectAuth(validatedProjectUuid, async (session, project) => {
    const apiKeys = await db.query.apiKeysTable.findMany({
      where: eq(apiKeysTable.project_uuid, validatedProjectUuid),
      with: {
        project: true,
        user: true,
      },
      orderBy: (keys, { desc }) => desc(keys.created_at),
    });

    return apiKeys as ApiKey[];
  });
}

export async function deleteApiKey(apiKeyUuid: string, projectUuid: string) {
  // Validate inputs
  const validatedApiKeyUuid = uuidSchema.parse(apiKeyUuid);
  const validatedProjectUuid = uuidSchema.parse(projectUuid);

  return withProjectAuth(validatedProjectUuid, async (session, project) => {
    // Delete the API key only if it belongs to the specified project
    await db
      .delete(apiKeysTable)
      .where(
        and(
          eq(apiKeysTable.uuid, validatedApiKeyUuid),
          eq(apiKeysTable.project_uuid, validatedProjectUuid)
        )
      );

    return { success: true };
  });
}

// ============================================================================
// User-level API key management functions
// ============================================================================

/**
 * Create a user-level API key with optional project permissions
 */
export async function createUserApiKey(options: {
  name?: string;
  description?: string;
  scope: 'all_projects' | 'specific_projects';
  projectUuids?: string[];
  expiresAt?: Date;
}) {
  // Validate inputs
  const validatedName = apiKeyNameSchema.parse(options.name);
  const validatedScope = apiKeyScopeSchema.parse(options.scope);
  const validatedProjectUuids = projectUuidsSchema.parse(options.projectUuids);

  return withAuth(async (session) => {
    // Verify projects belong to user
    if (validatedProjectUuids && validatedProjectUuids.length > 0) {
      const userProjects = await db
        .select({ uuid: projectsTable.uuid })
        .from(projectsTable)
        .where(
          and(
            eq(projectsTable.user_id, session.user.id),
            inArray(projectsTable.uuid, validatedProjectUuids)
          )
        );

      if (userProjects.length !== validatedProjectUuids.length) {
        throw new Error('Some projects do not belong to the user');
      }
    }

    const newApiKey = `pg_in_${nanoid(64)}`;

    const apiKey = await db
      .insert(apiKeysTable)
      .values({
        user_id: session.user.id,
        api_key: newApiKey,
        name: validatedName || 'API Key',
        description: options.description,
        all_projects_access: validatedScope === 'all_projects',
        project_permissions: validatedScope === 'specific_projects' ? validatedProjectUuids : null,
        expires_at: options.expiresAt,
        is_active: true,
      })
      .returning();

    return apiKey[0] as ApiKey;
  });
}

/**
 * Get all API keys for the current user
 */
export async function getUserApiKeys() {
  return withAuth(async (session) => {
    const apiKeys = await db.query.apiKeysTable.findMany({
      where: eq(apiKeysTable.user_id, session.user.id),
      with: {
        project: true, // Include project if still exists
      },
      orderBy: (keys, { desc }) => desc(keys.created_at),
    });

    return apiKeys as ApiKey[];
  });
}

/**
 * Update API key permissions
 */
export async function updateApiKeyPermissions(
  apiKeyUuid: string,
  options: {
    name?: string;
    description?: string;
    scope?: 'all_projects' | 'specific_projects';
    projectUuids?: string[];
    is_active?: boolean;
    expires_at?: Date | null;
  }
) {
  const validatedApiKeyUuid = uuidSchema.parse(apiKeyUuid);

  return withAuth(async (session) => {
    // Verify API key belongs to user
    const apiKey = await db.query.apiKeysTable.findFirst({
      where: and(
        eq(apiKeysTable.uuid, validatedApiKeyUuid),
        eq(apiKeysTable.user_id, session.user.id)
      ),
    });

    if (!apiKey) {
      throw new Error('API key not found or does not belong to user');
    }

    // Verify projects if updating permissions
    if (options.projectUuids && options.projectUuids.length > 0) {
      const userProjects = await db
        .select({ uuid: projectsTable.uuid })
        .from(projectsTable)
        .where(
          and(
            eq(projectsTable.user_id, session.user.id),
            inArray(projectsTable.uuid, options.projectUuids)
          )
        );

      if (userProjects.length !== options.projectUuids.length) {
        throw new Error('Some projects do not belong to the user');
      }
    }

    // Update the API key
    await db
      .update(apiKeysTable)
      .set({
        name: options.name,
        description: options.description,
        all_projects_access: options.scope ? options.scope === 'all_projects' : undefined,
        project_permissions: options.scope === 'specific_projects' ? options.projectUuids :
                            options.scope === 'all_projects' ? null : undefined,
        is_active: options.is_active,
        expires_at: options.expires_at,
      })
      .where(eq(apiKeysTable.uuid, validatedApiKeyUuid));

    return { success: true };
  });
}

/**
 * Delete a user-level API key
 */
export async function deleteUserApiKey(apiKeyUuid: string) {
  const validatedApiKeyUuid = uuidSchema.parse(apiKeyUuid);

  return withAuth(async (session) => {
    // Delete the API key only if it belongs to the user
    const result = await db
      .delete(apiKeysTable)
      .where(
        and(
          eq(apiKeysTable.uuid, validatedApiKeyUuid),
          eq(apiKeysTable.user_id, session.user.id)
        )
      )
      .returning({ uuid: apiKeysTable.uuid });

    if (result.length === 0) {
      throw new Error('API key not found or does not belong to user');
    }

    return { success: true };
  });
}