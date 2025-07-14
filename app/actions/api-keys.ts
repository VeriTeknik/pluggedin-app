'use server';

import { and, eq } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';
import { z } from 'zod';

import { db } from '@/db';
import { apiKeysTable, projectsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
import { ApiKey } from '@/types/api-key';

const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  64
);

// Validation schemas
const uuidSchema = z.string().uuid('Invalid UUID format');
const apiKeyNameSchema = z.string().min(1).max(100).optional();

export async function createApiKey(projectUuid: string, name?: string) {
  // Validate inputs
  const validatedProjectUuid = uuidSchema.parse(projectUuid);
  const validatedName = apiKeyNameSchema.parse(name);
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to create API keys');
  }
  
  // Verify the project belongs to the current user
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.uuid, validatedProjectUuid))
    .limit(1);

  if (project.length === 0) {
    throw new Error('Project not found');
  }
  
  if (project[0].user_id !== session.user.id) {
    throw new Error('Unauthorized - you do not have access to this project');
  }

  const newApiKey = `pg_in_${nanoid(64)}`;

  const apiKey = await db
    .insert(apiKeysTable)
    .values({
      project_uuid: validatedProjectUuid,
      api_key: newApiKey,
      name: validatedName,
    })
    .returning();

  return apiKey[0] as ApiKey;
}

export async function getFirstApiKey(projectUuid: string) {
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to access API keys');
  }
  
  if (!projectUuid) {
    return null;
  }

  // Validate input
  const validatedProjectUuid = uuidSchema.parse(projectUuid);

  // Verify the project belongs to the current user
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.uuid, validatedProjectUuid))
    .limit(1);

  if (project.length === 0) {
    throw new Error('Project not found');
  }
  
  if (project[0].user_id !== session.user.id) {
    throw new Error('Unauthorized - you do not have access to this project');
  }

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

  return apiKey as ApiKey;
}

export async function getApiKeys(projectUuid: string) {
  // Validate input
  const validatedProjectUuid = uuidSchema.parse(projectUuid);
  
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to view API keys');
  }
  
  // Verify the project belongs to the current user
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.uuid, validatedProjectUuid))
    .limit(1);

  if (project.length === 0) {
    throw new Error('Project not found');
  }
  
  if (project[0].user_id !== session.user.id) {
    throw new Error('Unauthorized - you do not have access to this project');
  }

  const apiKeys = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.project_uuid, validatedProjectUuid));

  return apiKeys as ApiKey[];
}

export async function deleteApiKey(apiKeyUuid: string, projectUuid: string) {
  // Validate inputs
  const validatedApiKeyUuid = uuidSchema.parse(apiKeyUuid);
  const validatedProjectUuid = uuidSchema.parse(projectUuid);
  
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to delete API keys');
  }
  
  // Verify the project belongs to the current user
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.uuid, validatedProjectUuid))
    .limit(1);

  if (project.length === 0) {
    throw new Error('Project not found');
  }
  
  if (project[0].user_id !== session.user.id) {
    throw new Error('Unauthorized - you do not have access to this project');
  }

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
}
