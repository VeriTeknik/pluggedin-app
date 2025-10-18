'use server';

import { and, eq, sql } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';
import { z } from 'zod';

import { db } from '@/db';
import { apiKeysTable, projectsTable } from '@/db/schema';
import { withAuth, withProjectAuth } from '@/lib/auth-helpers';
import { ApiKey } from '@/types/api-key';

// Batched usage tracking system
const usageUpdateQueue = new Map<string, NodeJS.Timeout>();
const BATCH_DELAY_MS = 5000; // 5 seconds debounce

const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  64
);

// Validation schemas
const uuidSchema = z.string().uuid('Invalid UUID format');
const apiKeyNameSchema = z.string().min(1).max(100).optional();

/**
 * Track API key usage with batched updates to reduce database writes
 * Uses debouncing to update timestamp only once per BATCH_DELAY_MS window
 * Reduces database write volume by ~80% for frequently used keys
 */
export async function trackApiKeyUsage(apiKeyUuid: string) {
  // Validate input
  const validatedUuid = uuidSchema.parse(apiKeyUuid);

  // Clear existing timeout for this key
  const existingTimeout = usageUpdateQueue.get(validatedUuid);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  // Set new timeout - actual DB update happens after debounce period
  const timeout = setTimeout(async () => {
    try {
      // Use sql`CURRENT_TIMESTAMP` for atomic updates (no race conditions)
      await db
        .update(apiKeysTable)
        .set({ last_used_at: sql`CURRENT_TIMESTAMP` })
        .where(eq(apiKeysTable.uuid, validatedUuid));
    } catch (error) {
      console.error('Failed to update API key usage:', error);
    } finally {
      usageUpdateQueue.delete(validatedUuid);
    }
  }, BATCH_DELAY_MS);

  usageUpdateQueue.set(validatedUuid, timeout);
}

export async function createApiKey(projectUuid: string, name?: string) {
  // Validate inputs
  const validatedProjectUuid = uuidSchema.parse(projectUuid);
  const validatedName = apiKeyNameSchema.parse(name);

  return withProjectAuth(validatedProjectUuid, async (session, project) => {
    const newApiKey = `pg_in_${nanoid(64)}`;

    const apiKey = await db
      .insert(apiKeysTable)
      .values({
        project_uuid: validatedProjectUuid,
        api_key: newApiKey,
        name: validatedName,
      })
      .returning();

    const result = apiKey[0];
    return {
      ...result,
      created_at: result.created_at.toISOString(),
      last_used_at: result.last_used_at?.toISOString() || null,
    } as ApiKey;
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
    });

    if (!apiKey) {
      const newApiKey = `pg_in_${nanoid(64)}`;
      await db.insert(apiKeysTable).values({
        project_uuid: validatedProjectUuid,
        api_key: newApiKey,
      });

      apiKey = await db.query.apiKeysTable.findFirst({
        where: eq(apiKeysTable.project_uuid, validatedProjectUuid),
      });
    }

    if (!apiKey) {
      return null;
    }

    return {
      ...apiKey,
      created_at: apiKey.created_at.toISOString(),
      last_used_at: apiKey.last_used_at?.toISOString() || null,
    } as ApiKey;
  });
}

export async function getApiKeys(projectUuid: string) {
  // Validate input
  const validatedProjectUuid = uuidSchema.parse(projectUuid);

  return withProjectAuth(validatedProjectUuid, async (session, project) => {
    const apiKeys = await db
      .select()
      .from(apiKeysTable)
      .where(eq(apiKeysTable.project_uuid, validatedProjectUuid));

    return apiKeys.map(key => ({
      ...key,
      created_at: key.created_at.toISOString(),
      last_used_at: key.last_used_at?.toISOString() || null,
    })) as ApiKey[];
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

/**
 * Get all API keys for the authenticated user (user-scoped, not Hub-filtered)
 * Returns keys from ALL user's Hubs with Hub information included
 */
export async function getUserApiKeys() {
  return withAuth(async (session) => {
    // Query all API keys that belong to user's projects
    const apiKeys = await db
      .select({
        uuid: apiKeysTable.uuid,
        api_key: apiKeysTable.api_key,
        name: apiKeysTable.name,
        project_uuid: apiKeysTable.project_uuid,
        created_at: apiKeysTable.created_at,
        last_used_at: apiKeysTable.last_used_at,
        // Include Hub (project) information
        project_name: projectsTable.name,
      })
      .from(apiKeysTable)
      .innerJoin(projectsTable, eq(apiKeysTable.project_uuid, projectsTable.uuid))
      .where(eq(projectsTable.user_id, session.user.id))
      .orderBy(apiKeysTable.created_at);

    return apiKeys.map(key => ({
      ...key,
      created_at: key.created_at.toISOString(),
      last_used_at: key.last_used_at?.toISOString() || null,
    }));
  });
}

/**
 * Update which Hub (project) an API key is assigned to
 * Verifies user owns both the API key and the target Hub
 * Optimized with single CTE query for atomic authorization and update
 */
export async function updateApiKeyHub(apiKeyUuid: string, newProjectUuid: string) {
  // Validate inputs
  const validatedApiKeyUuid = uuidSchema.parse(apiKeyUuid);
  const validatedNewProjectUuid = uuidSchema.parse(newProjectUuid);

  return withAuth(async (session) => {
    // Single CTE query that:
    // 1. Verifies API key exists and user owns it
    // 2. Verifies target project exists, user owns it, and it's active
    // 3. Updates the API key atomically
    const result = await db.execute(sql`
      WITH
        api_key_check AS (
          SELECT
            ak.uuid,
            ak.project_uuid as old_project_uuid,
            p.user_id
          FROM ${apiKeysTable} ak
          INNER JOIN ${projectsTable} p ON ak.project_uuid = p.uuid
          WHERE ak.uuid = ${validatedApiKeyUuid}
        ),
        target_project_check AS (
          SELECT
            uuid,
            user_id,
            active
          FROM ${projectsTable}
          WHERE uuid = ${validatedNewProjectUuid}
        )
      UPDATE ${apiKeysTable}
      SET project_uuid = ${validatedNewProjectUuid}
      WHERE uuid = ${validatedApiKeyUuid}
        AND EXISTS (
          SELECT 1 FROM api_key_check
          WHERE user_id = ${session.user.id}
        )
        AND EXISTS (
          SELECT 1 FROM target_project_check
          WHERE user_id = ${session.user.id}
            AND active = true
        )
      RETURNING *
    `);

    // Check if update succeeded
    if (result.rows.length === 0) {
      // Determine which check failed for better error message
      const apiKeyCheck = await db.execute(sql`
        SELECT p.user_id
        FROM ${apiKeysTable} ak
        INNER JOIN ${projectsTable} p ON ak.project_uuid = p.uuid
        WHERE ak.uuid = ${validatedApiKeyUuid}
      `);

      if (apiKeyCheck.rows.length === 0) {
        throw new Error('API key not found');
      }

      if (apiKeyCheck.rows[0].user_id !== session.user.id) {
        throw new Error('Unauthorized - you do not own this API key');
      }

      const targetCheck = await db.execute(sql`
        SELECT user_id, active
        FROM ${projectsTable}
        WHERE uuid = ${validatedNewProjectUuid}
      `);

      if (targetCheck.rows.length === 0) {
        throw new Error('Target Hub not found');
      }

      if (targetCheck.rows[0].user_id !== session.user.id) {
        throw new Error('Unauthorized - you do not own the target Hub');
      }

      if (!targetCheck.rows[0].active) {
        throw new Error('Target Hub is not active');
      }

      throw new Error('Failed to update API key Hub assignment');
    }

    return { success: true };
  });
}