'use server';

import { and, eq } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';

import { db } from '@/db';
import { apiKeysTable, projectsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
import { ApiKey } from '@/types/api-key';

const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  64
);

export async function createApiKey(projectUuid: string, name?: string) {
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to create API keys');
  }
  
  // Verify the project belongs to the current user
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.uuid, projectUuid))
    .limit(1);

  if (project.length === 0) {
    throw new Error('Project not found');
  }
  
  if (project[0].user_id !== session.user.id) {
    throw new Error('Unauthorized - you do not have access to this project');
  }

  const newApiKey = `sk_mt_${nanoid(64)}`;

  const apiKey = await db
    .insert(apiKeysTable)
    .values({
      project_uuid: projectUuid,
      api_key: newApiKey,
      name,
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

  // Verify the project belongs to the current user
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.uuid, projectUuid))
    .limit(1);

  if (project.length === 0) {
    throw new Error('Project not found');
  }
  
  if (project[0].user_id !== session.user.id) {
    throw new Error('Unauthorized - you do not have access to this project');
  }

  let apiKey = await db.query.apiKeysTable.findFirst({
    where: eq(apiKeysTable.project_uuid, projectUuid),
  });

  if (!apiKey) {
    const newApiKey = `sk_mt_${nanoid(64)}`;
    await db.insert(apiKeysTable).values({
      project_uuid: projectUuid,
      api_key: newApiKey,
    });

    apiKey = await db.query.apiKeysTable.findFirst({
      where: eq(apiKeysTable.project_uuid, projectUuid),
    });
  }

  return apiKey as ApiKey;
}

export async function getApiKeys(projectUuid: string) {
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to view API keys');
  }
  
  // Verify the project belongs to the current user
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.uuid, projectUuid))
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
    .where(eq(apiKeysTable.project_uuid, projectUuid));

  return apiKeys as ApiKey[];
}

export async function deleteApiKey(apiKeyUuid: string, projectUuid: string) {
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to delete API keys');
  }
  
  // Verify the project belongs to the current user
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.uuid, projectUuid))
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
        eq(apiKeysTable.uuid, apiKeyUuid),
        eq(apiKeysTable.project_uuid, projectUuid)
      )
    );

  return { success: true };
}
