'use server';

import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { codesTable } from '@/db/schema';

export async function getCodes() {
  return await db
    .select()
    .from(codesTable)
    .orderBy(desc(codesTable.created_at));
}

export async function getCode(uuid: string) {
  const results = await db
    .select()
    .from(codesTable)
    .where(eq(codesTable.uuid, uuid));
  return results[0];
}

export async function createCode(fileName: string, code: string) {
  const results = await db
    .insert(codesTable)
    .values({
      fileName,
      code,
    })
    .returning();
  return results[0];
}

export async function updateCode(uuid: string, fileName: string, code: string) {
  const results = await db
    .update(codesTable)
    .set({
      fileName,
      code,
    })
    .where(eq(codesTable.uuid, uuid))
    .returning();
  return results[0];
}

export async function deleteCode(uuid: string) {
  const results = await db
    .delete(codesTable)
    .where(eq(codesTable.uuid, uuid))
    .returning();
  return results[0];
}
