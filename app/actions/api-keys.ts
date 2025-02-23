'use server';

import { and, eq } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';

import { db } from '@/db';
import { apiKeysTable } from '@/db/schema';
import { ApiKey } from '@/types/api-key';

const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  64
);

export async function createApiKey(projectUuid: string, name?: string) {
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
  if (!projectUuid) {
    return null;
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

export async function getProjectApiKeys(projectUuid: string) {
  const apiKeys = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.project_uuid, projectUuid));

  return apiKeys as ApiKey[];
}

export async function deleteApiKey(projectUuid: string, apiKeyUuid: string) {
  await db
    .delete(apiKeysTable)
    .where(
      and(
        eq(apiKeysTable.uuid, apiKeyUuid),
        eq(apiKeysTable.project_uuid, projectUuid)
      )
    );
}
